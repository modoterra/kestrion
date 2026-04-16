/* eslint-disable max-lines */

import { afterEach, expect, test } from 'bun:test'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
	createFireworksTextStreamEvent,
	createFireworksToolCallStreamEvent
} from '../../../test/fireworks-stream-test-utils'
import {
	clearMockFireworksScenarioResponses,
	mockFireworksScenarioResponses
} from '../../../test/mock-fireworks-scenarios'
import {
	clearMockFireworksTextResponses,
	mockFireworksTextResponses
} from '../../../test/mock-fireworks-text-responses'
import { createRenderAppContext } from '../../../test/render-app-context'
import { SubprocessTurnRunner } from '../worker/subprocess-turn-runner'
import { DaemonController } from './controller'

const originalFetch = globalThis.fetch
const cleanupPaths: string[] = []

afterEach(() => {
	globalThis.fetch = originalFetch
	clearMockFireworksTextResponses()
	clearMockFireworksScenarioResponses()

	for (const path of cleanupPaths.splice(0).toReversed()) {
		rmSync(path, { force: true, recursive: true })
	}
})

test('streams assistant replies through the daemon controller', async () => {
	mockFireworksTextResponses(['Hello from the daemon'])

	const homeDir = mkdtempSync(join(tmpdir(), 'kestrion-daemon-'))
	cleanupPaths.push(homeDir)

	const { agentService, config, paths, store } = createRenderAppContext(homeDir, { providerConfigured: true })
	const controller = new DaemonController(store, agentService, paths, new SubprocessTurnRunner(), config)

	try {
		const bootstrap = await controller.bootstrap()
		expect(bootstrap.conversations).toHaveLength(0)

		const thread = await controller.addUserMessage('draft', 'Ship it')
		let streamedText = ''
		const replyThread = await controller.generateAssistantReply(thread.conversation.id, event => {
			if (event.type === 'textDelta') {
				streamedText += event.delta
			}
		})
		const transcript = await controller.loadConversationWorkerTranscript(thread.conversation.id)

		expect(streamedText).toBe('Hello from the daemon')
		expect(replyThread.messages.at(-1)?.content).toBe('Hello from the daemon')
		expect((await controller.listConversations()).at(0)?.title).toContain('Ship it')
		expect(transcript.map(entry => entry.kind)).toContain('turnInput')
		expect(transcript.map(entry => entry.kind)).toContain('workerEvent')

		const auditFiles = readdirSync(paths.auditDir)
		expect(auditFiles.length).toBe(0)
	} finally {
		store.close()
	}
})

test('executes remember tool calls through the daemon host bridge', async () => {
	mockFireworksScenarioResponses(createRememberScenarioResponses())

	const homeDir = mkdtempSync(join(tmpdir(), 'kestrion-daemon-remember-'))
	cleanupPaths.push(homeDir)

	const { agentService, config, paths, store } = createRenderAppContext(homeDir, { providerConfigured: true })
	const controller = new DaemonController(store, agentService, paths, new SubprocessTurnRunner(), config)

	try {
		const thread = await controller.addUserMessage('draft', 'Remember the launch checklist.')
		const replyThread = await controller.generateAssistantReply(thread.conversation.id, () => {})
		const remembered = await controller.loadMemorySnapshot()
		const transcript = await controller.loadConversationWorkerTranscript(thread.conversation.id)

		expect(replyThread.messages.at(-1)?.content).toBe('Saved that memory.')
		expect(remembered.episodic).toEqual([
			expect.objectContaining({ content: 'Remember the launch checklist', tags: ['release'], title: 'Launch' })
		])
		expect(transcript.map(entry => entry.kind)).toContain('hostToolRequest')
		expect(transcript.map(entry => entry.kind)).toContain('hostToolResponse')
	} finally {
		store.close()
	}
})

test('denies hosted remember calls when policy rejects the requested memory kind', async () => {
	mockFireworksScenarioResponses(createRememberScenarioResponses())

	const homeDir = mkdtempSync(join(tmpdir(), 'kestrion-daemon-remember-deny-'))
	cleanupPaths.push(homeDir)

	const { agentService, config, paths, store } = createRenderAppContext(homeDir, { providerConfigured: true })
	const policy = store.loadToolPolicy()
	policy.tools.remember.allowedMemoryKinds = ['scratch']
	store.saveToolPolicy(policy)
	const controller = new DaemonController(store, agentService, paths, new SubprocessTurnRunner(), config)

	try {
		const thread = await controller.addUserMessage('draft', 'Remember the launch checklist.')

		await expect(controller.generateAssistantReply(thread.conversation.id, () => {})).rejects.toThrow(
			'denied by policy'
		)
	} finally {
		store.close()
	}
})

test('fails daemon replies when MATRIX.md is missing', async () => {
	const homeDir = mkdtempSync(join(tmpdir(), 'kestrion-daemon-matrix-missing-'))
	cleanupPaths.push(homeDir)

	const { agentService, config, paths, store } = createRenderAppContext(homeDir, {
		matrixConfigured: false,
		providerConfigured: true
	})
	const controller = new DaemonController(store, agentService, paths, new SubprocessTurnRunner(), config)

	try {
		const thread = await controller.addUserMessage('draft', 'Ship it')

		await expect(controller.generateAssistantReply(thread.conversation.id, () => {})).rejects.toThrow(
			config.matrixPromptPath
		)
	} finally {
		store.close()
	}
})

test('applies a session approval so repeated denied tool calls stop prompting', async () => {
	mockFireworksScenarioResponses([
		...createLongTermRememberScenarioResponses('Remember the archive plan', 'Stored after approval.'),
		...createLongTermRememberScenarioResponses('Remember the disaster plan', 'Stored after approval.')
	])

	const homeDir = mkdtempSync(join(tmpdir(), 'kestrion-daemon-session-approval-'))
	cleanupPaths.push(homeDir)

	const { agentService, config, paths, store } = createRenderAppContext(homeDir, { providerConfigured: true })
	const policy = store.loadToolPolicy()
	policy.tools.remember.allowedMemoryKinds = ['scratch']
	store.saveToolPolicy(policy)
	const controller = new DaemonController(store, agentService, paths, new SubprocessTurnRunner(), config)
	const prompts: string[] = []

	try {
		const firstThread = await controller.addUserMessage('draft', 'Remember the archive plan.')
		const firstReply = await controller.generateAssistantReply(
			firstThread.conversation.id,
			() => {},
			undefined,
			prompt => {
				prompts.push(prompt.requestedAccess)
				return Promise.resolve({ mode: 'allowSession' })
			}
		)
		const secondThread = await controller.addUserMessage(firstReply.conversation.id, 'Remember the disaster plan.')
		const secondReply = await controller.generateAssistantReply(
			secondThread.conversation.id,
			() => {},
			undefined,
			() => Promise.resolve({ mode: 'deny' })
		)

		expect(firstReply.messages.at(-1)?.content).toBe('Stored after approval.')
		expect(secondReply.messages.at(-1)?.content).toBe('Stored after approval.')
		expect(prompts).toHaveLength(1)
	} finally {
		store.close()
	}
})

test('persisted deny-forever suppresses future approval prompts for the same denied call', async () => {
	mockFireworksScenarioResponses([
		createLongTermRememberToolOnlyScenario('Remember the archive plan'),
		createLongTermRememberToolOnlyScenario('Remember the disaster plan')
	])

	const homeDir = mkdtempSync(join(tmpdir(), 'kestrion-daemon-deny-forever-'))
	cleanupPaths.push(homeDir)

	const { agentService, config, paths, store } = createRenderAppContext(homeDir, { providerConfigured: true })
	const policy = store.loadToolPolicy()
	policy.tools.remember.allowedMemoryKinds = ['scratch']
	store.saveToolPolicy(policy)
	const controller = new DaemonController(store, agentService, paths, new SubprocessTurnRunner(), config)
	let promptCount = 0

	try {
		const firstThread = await controller.addUserMessage('draft', 'Remember the archive plan.')
		await expect(
			controller.generateAssistantReply(
				firstThread.conversation.id,
				() => {},
				undefined,
				() => {
					promptCount += 1
					return Promise.resolve({ mode: 'denyForever' })
				}
			)
		).rejects.toThrow('Tool call denied by the user.')

		const secondThread = await controller.addUserMessage(firstThread.conversation.id, 'Remember the disaster plan.')
		await expect(
			controller.generateAssistantReply(
				secondThread.conversation.id,
				() => {},
				undefined,
				() => {
					promptCount += 1
					return Promise.resolve({ mode: 'allowOnce' })
				}
			)
		).rejects.toThrow('denied by policy')

		expect(promptCount).toBe(1)
	} finally {
		store.close()
	}
})

test('retains partial transcript entries when a hosted tool request fails', async () => {
	mockFireworksScenarioResponses([createHostedToolFailureScenario()])

	const homeDir = mkdtempSync(join(tmpdir(), 'kestrion-daemon-partial-'))
	cleanupPaths.push(homeDir)

	const { agentService, config, paths, store } = createRenderAppContext(homeDir, { providerConfigured: true })
	const runner = new SubprocessTurnRunner()

	try {
		const thread = agentService.addUserMessage('draft', 'Force a hosted tool failure.')
		const transcriptEntries: Array<{ kind: string; payloadJson: string }> = []

		await expect(
			runner.runTurn(
				{
					config,
					conversation: thread.conversation,
					hostMounts: { agentRoot: paths.agentDir, configRoot: paths.configDir },
					messages: thread.messages,
					turnId: 'turn-host-tool-error'
				},
				() => {},
				undefined,
				undefined,
				() => {
					throw new Error('Memory bridge offline.')
				},
				entry => {
					transcriptEntries.push({ kind: entry.kind, payloadJson: entry.payloadJson })
				}
			)
		).rejects.toThrow('Memory bridge offline.')

		expect(transcriptEntries.map(entry => entry.kind)).toEqual(
			expect.arrayContaining(['turnInput', 'hostToolRequest', 'hostToolError'])
		)
		expect(transcriptEntries.some(entry => entry.payloadJson.includes('Memory bridge offline.'))).toBeTrue()
	} finally {
		store.close()
	}
})

function createHostedToolFailureScenario(): {
	events: Array<{ data: '[DONE]' | Record<string, unknown> }>
	kind: 'stream'
} {
	return {
		events: [
			createFireworksToolCallStreamEvent([
				{
					argumentsJson: JSON.stringify({
						action: 'write',
						content: 'Remember the failure path',
						memory: 'episodic',
						title: 'Failure'
					}),
					id: 'call_remember_fail',
					name: 'remember'
				}
			]),
			{ data: '[DONE]' }
		],
		kind: 'stream'
	}
}

function createRememberScenarioResponses(): Array<{
	events: Array<{ data: '[DONE]' | Record<string, unknown> }>
	kind: 'stream'
}> {
	return [
		{
			events: [
				createFireworksToolCallStreamEvent([
					{
						argumentsJson: JSON.stringify({
							action: 'write',
							content: 'Remember the launch checklist',
							memory: 'episodic',
							tags: ['release'],
							title: 'Launch'
						}),
						id: 'call_remember_1',
						name: 'remember'
					}
				]),
				{ data: '[DONE]' }
			],
			kind: 'stream'
		},
		{ events: [createFireworksTextStreamEvent('Saved that memory.'), { data: '[DONE]' }], kind: 'stream' }
	]
}

function createLongTermRememberScenarioResponses(
	content: string,
	reply: string
): Array<{ events: Array<{ data: '[DONE]' | Record<string, unknown> }>; kind: 'stream' }> {
	return [
		createLongTermRememberToolOnlyScenario(content),
		{ events: [createFireworksTextStreamEvent(reply), { data: '[DONE]' }], kind: 'stream' }
	]
}

function createLongTermRememberToolOnlyScenario(content: string): {
	events: Array<{ data: '[DONE]' | Record<string, unknown> }>
	kind: 'stream'
} {
	return {
		events: [
			createFireworksToolCallStreamEvent([
				{
					argumentsJson: JSON.stringify({ action: 'write', content, memory: 'long-term', title: 'Archive' }),
					id: `call_${content.replaceAll(/\W+/g, '_')}`,
					name: 'remember'
				}
			]),
			{ data: '[DONE]' }
		],
		kind: 'stream'
	}
}
