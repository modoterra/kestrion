/* eslint-disable max-lines */

import { afterEach, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
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
import { createToolInvocationAuditRecord } from '../../tools/audit'
import type { ToolExecutionContext, ToolInvocationAuditRecord, ToolMutationRecord } from '../../tools/tool-types'
import { WORKSPACE_TOOL_REGISTRY } from '../../tools/workspace-tool-registry'
import type { WorkerTranscriptEntry, WorkerTranscriptKind } from '../../types'
import type { TurnRunner, WorkerSession } from '../worker/turn-runner'
import type {
	WorkerExecutionEvent,
	WorkerSessionRequest,
	WorkerToolExecutionRequest,
	WorkerToolExecutionResponse
} from '../worker/types'
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

function createTestTurnRunner(
	options: { failToolExecution?: (request: WorkerToolExecutionRequest) => Error | null } = {}
): TurnRunner {
	return {
		async startSession(
			input: WorkerSessionRequest,
			_signal?: AbortSignal,
			onTranscriptEntry?: (entry: Omit<WorkerTranscriptEntry, 'id'>) => void,
			onExecutionEvent?: (event: WorkerExecutionEvent) => void
		): Promise<WorkerSession> {
			let sequence = 0
			const recordTranscript = (
				direction: 'daemonToWorker' | 'workerToDaemon',
				kind: WorkerTranscriptKind,
				payload: unknown
			): void => {
				onTranscriptEntry?.({
					conversationId: input.conversation.id,
					createdAt: new Date().toISOString(),
					direction,
					kind,
					payloadJson: JSON.stringify(payload),
					sequence: sequence++,
					turnId: input.turnId
				})
			}

			recordTranscript('daemonToWorker', 'sessionBootstrap', {
				conversationId: input.conversation.id,
				turnId: input.turnId
			})

			return {
				close: async (): Promise<void> => {
					recordTranscript('daemonToWorker', 'shutdown', { reason: 'turn complete' })
				},
				executeTool: async (request: WorkerToolExecutionRequest): Promise<WorkerToolExecutionResponse> => {
					recordTranscript('daemonToWorker', 'executeToolRequest', request)
					onExecutionEvent?.({ requestId: request.requestId, toolName: request.toolName, type: 'toolStarted' })

					const failure = options.failToolExecution?.(request) ?? null
					if (failure) {
						recordTranscript('workerToDaemon', 'executionError', {
							error: failure.message,
							requestId: request.requestId
						})
						return Promise.reject(failure)
					}

					const tool = WORKSPACE_TOOL_REGISTRY.find(candidate => candidate.name === request.toolName)
					if (!tool) {
						throw new Error(`Unknown worker tool "${request.toolName}".`)
					}

					const audits: ToolInvocationAuditRecord[] = []
					const mutations: ToolMutationRecord[] = []
					const startedAt = Date.now()
					const result = await tool.execute(
						request.argumentsJson,
						buildTestToolExecutionContext(input, request, audits, mutations)
					)
					const response: WorkerToolExecutionResponse = {
						audits: [
							...audits,
							createToolInvocationAuditRecord(request.toolName, request.argumentsJson, result, Date.now() - startedAt)
						],
						mutations,
						ok: true,
						requestId: request.requestId,
						result,
						telemetry: { durationMs: Date.now() - startedAt }
					}

					recordTranscript('workerToDaemon', 'executeToolResponse', response)
					onExecutionEvent?.({ requestId: request.requestId, toolName: request.toolName, type: 'toolCompleted' })
					return response
				}
			}
		}
	}
}

function buildTestToolExecutionContext(
	input: WorkerSessionRequest,
	request: WorkerToolExecutionRequest,
	audits: ToolInvocationAuditRecord[],
	mutations: ToolMutationRecord[]
): ToolExecutionContext {
	return {
		allowedMemoryKinds: request.authorization.allowedMemoryKinds,
		allowedSkillNames: request.authorization.allowedSkillNames,
		fileAccessPolicy: request.authorization.fileAccessPolicy
			? {
					defaultReadRoot: mapVirtualRootToHostRoot(
						request.authorization.fileAccessPolicy.defaultReadRoot,
						input.hostMounts
					),
					readRoots: request.authorization.fileAccessPolicy.readRoots.map(root =>
						mapVirtualRootToHostRoot(root, input.hostMounts)
					),
					writeRoots: request.authorization.fileAccessPolicy.writeRoots.map(root =>
						mapVirtualRootToHostRoot(root, input.hostMounts)
					)
				}
			: undefined,
		networkAccessPolicy: request.authorization.networkAccessPolicy,
		onAuditRecord: audit => {
			audits.push(audit)
		},
		onMutation: mutation => {
			mutations.push(mutation)
		},
		todoAllowed: request.authorization.todoAllowed,
		toolRegistry: WORKSPACE_TOOL_REGISTRY,
		workspaceRoot: input.hostMounts.agentRoot
	}
}

function mapVirtualRootToHostRoot(virtualRoot: string, hostMounts: WorkerSessionRequest['hostMounts']): string {
	return virtualRoot === '/config' ? hostMounts.configRoot : hostMounts.agentRoot
}

test('streams assistant replies through the daemon controller', async () => {
	mockFireworksTextResponses(['Hello from the daemon'])

	const homeDir = mkdtempSync(join(tmpdir(), 'kestrion-daemon-'))
	cleanupPaths.push(homeDir)

	const { agentService, config, paths, store } = createRenderAppContext(homeDir, {
		configureToolPolicy: policy => {
			policy.tools.bash.allowed = true
			return policy
		},
		providerConfigured: true
	})
	const controller = new DaemonController(store, agentService, paths, createTestTurnRunner(), config)

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
		expect(transcript.map(entry => entry.kind)).toContain('sessionBootstrap')
		expect(transcript.map(entry => entry.kind)).toContain('shutdown')

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

	const { agentService, config, paths, store } = createRenderAppContext(homeDir, {
		configureToolPolicy: policy => {
			policy.tools.bash.allowed = true
			return policy
		},
		providerConfigured: true
	})
	const controller = new DaemonController(store, agentService, paths, createTestTurnRunner(), config)

	try {
		const thread = await controller.addUserMessage('draft', 'Remember the launch checklist.')
		const replyThread = await controller.generateAssistantReply(thread.conversation.id, () => {})
		const remembered = await controller.loadMemorySnapshot()
		const transcript = await controller.loadConversationWorkerTranscript(thread.conversation.id)

		expect(replyThread.messages.at(-1)?.content).toBe('Saved that memory.')
		expect(remembered.episodic).toEqual([
			expect.objectContaining({ content: 'Remember the launch checklist', tags: ['release'], title: 'Launch' })
		])
		expect(transcript.map(entry => entry.kind)).toEqual(expect.arrayContaining(['sessionBootstrap', 'shutdown']))
		expect(transcript.map(entry => entry.kind)).not.toContain('executeToolRequest')
	} finally {
		store.close()
	}
})

test('denies hosted remember calls when policy rejects the requested memory kind', async () => {
	mockFireworksScenarioResponses(createRememberScenarioResponses())

	const homeDir = mkdtempSync(join(tmpdir(), 'kestrion-daemon-remember-deny-'))
	cleanupPaths.push(homeDir)

	const { agentService, config, paths, store } = createRenderAppContext(homeDir, {
		configureToolPolicy: policy => {
			policy.tools.bash.allowed = true
			return policy
		},
		providerConfigured: true
	})
	const policy = store.loadToolPolicy()
	policy.tools.remember.allowedMemoryKinds = ['scratch']
	store.saveToolPolicy(policy)
	const controller = new DaemonController(store, agentService, paths, createTestTurnRunner(), config)

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
	const controller = new DaemonController(store, agentService, paths, createTestTurnRunner(), config)

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

	const { agentService, config, paths, store } = createRenderAppContext(homeDir, {
		configureToolPolicy: policy => {
			policy.tools.bash.allowed = true
			return policy
		},
		providerConfigured: true
	})
	const policy = store.loadToolPolicy()
	policy.tools.remember.allowedMemoryKinds = ['scratch']
	store.saveToolPolicy(policy)
	const controller = new DaemonController(store, agentService, paths, createTestTurnRunner(), config)
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
	const controller = new DaemonController(store, agentService, paths, createTestTurnRunner(), config)
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

test('retains partial transcript entries when a workspace tool request fails', async () => {
	mockFireworksScenarioResponses([createWorkspaceToolFailureScenario()])

	const homeDir = mkdtempSync(join(tmpdir(), 'kestrion-daemon-partial-'))
	cleanupPaths.push(homeDir)

	const { agentService, config, paths, store } = createRenderAppContext(homeDir, {
		configureToolPolicy: policy => {
			policy.tools.bash.allowed = true
			return policy
		},
		providerConfigured: true
	})
	const controller = new DaemonController(
		store,
		agentService,
		paths,
		createTestTurnRunner({
			failToolExecution: request => {
				if (request.toolName === 'bash') {
					return new Error('Memory bridge offline.')
				}

				return null
			}
		}),
		config
	)

	try {
		const thread = agentService.addUserMessage('draft', 'Force a workspace tool failure.')
		const transcriptEntries: Array<{ kind: string; payloadJson: string }> = []

		await expect(
			controller.generateAssistantReply(
				thread.conversation.id,
				() => {},
				undefined,
				undefined,
				undefined,
				entry => {
					transcriptEntries.push({ kind: entry.kind, payloadJson: entry.payloadJson })
				}
			)
		).rejects.toThrow('Memory bridge offline.')

		expect(transcriptEntries.map(entry => entry.kind)).toEqual(
			expect.arrayContaining(['sessionBootstrap', 'executeToolRequest', 'executionError'])
		)
		expect(transcriptEntries.some(entry => entry.payloadJson.includes('Memory bridge offline.'))).toBeTrue()
	} finally {
		store.close()
	}
})

test('writes append-only audit rows for local bash tool executions', async () => {
	mockFireworksScenarioResponses([
		{
			events: [
				createFireworksToolCallStreamEvent([
					{ argumentsJson: JSON.stringify({ command: 'pwd' }), id: 'call_bash_1', name: 'bash' }
				]),
				{ data: '[DONE]' }
			],
			kind: 'stream'
		},
		{ events: [createFireworksTextStreamEvent('Ran the command.'), { data: '[DONE]' }], kind: 'stream' }
	])

	const homeDir = mkdtempSync(join(tmpdir(), 'kestrion-daemon-bash-audit-'))
	cleanupPaths.push(homeDir)

	const { agentService, config, paths, store } = createRenderAppContext(homeDir, {
		configureToolPolicy: policy => {
			policy.tools.bash.allowed = true
			return policy
		},
		providerConfigured: true
	})
	const controller = new DaemonController(store, agentService, paths, createTestTurnRunner(), config)

	try {
		const thread = await controller.addUserMessage('draft', 'Run pwd.')
		await controller.generateAssistantReply(thread.conversation.id, () => {})

		const [auditFile] = readdirSync(paths.auditDir).filter(entry => entry.endsWith('.jsonl'))
		const auditLines = readFileSync(join(paths.auditDir, auditFile ?? ''), 'utf8')
			.trim()
			.split('\n')
			.filter(Boolean)
			.map(line => JSON.parse(line) as { entry?: { kind?: string; tool?: { status?: string; toolName?: string } } })

		expect(auditLines).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					entry: expect.objectContaining({
						kind: 'toolInvocation',
						tool: expect.objectContaining({ status: 'success', toolName: 'bash' })
					})
				})
			])
		)
	} finally {
		store.close()
	}
})

function createWorkspaceToolFailureScenario(): {
	events: Array<{ data: '[DONE]' | Record<string, unknown> }>
	kind: 'stream'
} {
	return {
		events: [
			createFireworksToolCallStreamEvent([
				{ argumentsJson: JSON.stringify({ command: 'pwd' }), id: 'call_bash_fail', name: 'bash' }
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
