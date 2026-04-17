import { afterEach, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
	clearMockFireworksScenarioResponses,
	mockFireworksScenarioResponses,
	readMockFireworksScenarioRequests
} from '../../test/mock-fireworks-scenarios'
import { clearMockFireworksTextResponses, mockFireworksTextResponses } from '../../test/mock-fireworks-text-responses'
import { loadWritableAppConfig, saveAppConfig } from '../config'
import { resolveAppPaths } from '../paths'
import { ConversationStore } from '../storage/conversation-store'
import { AgentService } from './agent-service'

const cleanupPaths: string[] = []

afterEach(() => {
	clearMockFireworksScenarioResponses()
	clearMockFireworksTextResponses()

	for (const path of cleanupPaths.splice(0)) {
		rmSync(path, { force: true, recursive: true })
	}
})

test('uses transient Kimi instant tuning in the direct service path without persisting anchor messages', async () => {
	mockFireworksScenarioResponses([
		{
			body: {
				choices: [{ message: { content: 'Formatted it.' } }],
				id: 'chatcmpl_service_instant',
				model: 'accounts/fireworks/models/kimi-k2p5'
			},
			kind: 'json'
		}
	])

	const homeDir = mkdtempSync(join(tmpdir(), 'kestrion-agent-service-kimi-'))
	cleanupPaths.push(homeDir)

	const paths = resolveAppPaths({ homeDir, runtimeDir: `${homeDir}/.runtime/kestrion` })
	writeMatrixPrompt(paths.configDir)
	const writableConfig = loadWritableAppConfig(paths)
	writableConfig.providers.fireworks.providerMode = 'fireworks'
	writableConfig.providers.fireworks.apiKey = 'test-api-key'
	writableConfig.providers.fireworks.model = 'accounts/fireworks/models/kimi-k2p5'
	const config = saveAppConfig(paths, writableConfig)
	const store = new ConversationStore(paths.databaseFile)
	const service = new AgentService(store, config)

	try {
		const thread = service.addUserMessage('draft', 'Now format that as a clean markdown table.')
		const replyThread = await service.generateAssistantReply(thread.conversation.id)
		const [requestBody] = readMockFireworksScenarioRequests()
		const parsedBody = JSON.parse(requestBody ?? '{}') as {
			max_tokens?: number
			messages?: Array<{ content?: string; role?: string }>
			prompt_truncate_len?: number
			reasoning_effort?: string
			temperature?: number
			top_p?: number
		}

		expect(parsedBody.temperature).toBe(0.6)
		expect(parsedBody.top_p).toBe(0.95)
		expect(parsedBody.max_tokens).toBe(2048)
		expect(parsedBody.prompt_truncate_len).toBe(8000)
		expect(parsedBody.reasoning_effort).toBe('none')
		expect(parsedBody.messages?.map(message => message.role)).toEqual(['system', 'assistant', 'user'])
		expect(parsedBody.messages?.[1]?.content).toContain(
			'Continue from the existing conversation instead of restarting.'
		)
		expect(replyThread.messages.map(message => message.role)).toEqual(['user', 'assistant'])
	} finally {
		store.close()
	}
})

test('uses the current configured model for the next assistant reply in an existing conversation', async () => {
	mockFireworksTextResponses(['Using the new model now.'])

	const homeDir = mkdtempSync(join(tmpdir(), 'kestrion-agent-service-'))
	cleanupPaths.push(homeDir)

	const paths = resolveAppPaths({ homeDir, runtimeDir: `${homeDir}/.runtime/kestrion` })
	writeMatrixPrompt(paths.configDir)
	const writableConfig = loadWritableAppConfig(paths)
	writableConfig.providers.fireworks.providerMode = 'fireworks'
	writableConfig.providers.fireworks.apiKey = 'test-api-key'
	const initialConfig = saveAppConfig(paths, writableConfig)
	const store = new ConversationStore(paths.databaseFile)
	const service = new AgentService(store, initialConfig)

	try {
		const thread = service.addUserMessage('draft', 'Start with the default model.')

		writableConfig.providers.fireworks.model = 'accounts/fireworks/models/kimi-k2-thinking'
		const updatedConfig = saveAppConfig(paths, writableConfig)
		service.updateConfig(updatedConfig)

		const replyThread = await service.generateAssistantReply(thread.conversation.id)
		const lastAssistantMessage = replyThread.messages.at(-1)

		expect(lastAssistantMessage?.role).toBe('assistant')
		expect(lastAssistantMessage?.model).toBe('accounts/fireworks/models/kimi-k2-thinking')
		expect(replyThread.conversation.model).toBe('accounts/fireworks/models/kimi-k2-thinking')
	} finally {
		store.close()
	}
})

test('fails before inference when MATRIX.md is missing', async () => {
	const homeDir = mkdtempSync(join(tmpdir(), 'kestrion-agent-service-matrix-'))
	cleanupPaths.push(homeDir)

	const paths = resolveAppPaths({ homeDir, runtimeDir: `${homeDir}/.runtime/kestrion` })
	const writableConfig = loadWritableAppConfig(paths)
	writableConfig.providers.fireworks.providerMode = 'fireworks'
	writableConfig.providers.fireworks.apiKey = 'test-api-key'
	const config = saveAppConfig(paths, writableConfig)
	const store = new ConversationStore(paths.databaseFile)
	const service = new AgentService(store, config)

	try {
		const thread = service.addUserMessage('draft', 'Start with the default model.')

		await expect(service.generateAssistantReply(thread.conversation.id)).rejects.toThrow(config.matrixPromptPath)
	} finally {
		store.close()
	}
})

test('creates a persisted compaction checkpoint without rewriting message history', async () => {
	mockFireworksScenarioResponses([
		{
			body: {
				choices: [{ message: { content: 'Checkpoint summary for the oldest turn.' } }],
				id: 'chatcmpl_compact_manual',
				model: 'accounts/fireworks/models/kimi-k2p5'
			},
			kind: 'json'
		}
	])

	const { service, store } = createAgentServiceContext('kestrion-agent-service-compact-manual-')

	try {
		const thread = createThreadWithTurns(service, store, 5)
		const originalMessages = thread.messages.map(message => message.content)

		const result = await service.compactConversation(thread.conversation.id)
		const checkpoint = store.getConversationCompaction(thread.conversation.id)

		expect(result).toEqual({ compacted: true, conversationId: thread.conversation.id, reason: 'updated' })
		expect(checkpoint?.summary).toBe('Checkpoint summary for the oldest turn.')
		expect(service.loadConversation(thread.conversation.id).messages.map(message => message.content)).toEqual(originalMessages)
	} finally {
		store.close()
	}
})

test('manual compaction still compacts when prompt-size pressure exceeds the threshold inside the retained tail', async () => {
	mockFireworksScenarioResponses([
		{
			body: {
				choices: [{ message: { content: 'Checkpoint summary from manual size pressure.' } }],
				id: 'chatcmpl_compact_manual_chars',
				model: 'accounts/fireworks/models/kimi-k2p5'
			},
			kind: 'json'
		}
	])

	const { service, store, writableConfig, updateServiceConfig } = createAgentServiceContext(
		'kestrion-agent-service-compact-manual-chars-'
	)

	try {
		writableConfig.providers.fireworks.compactAutoPromptChars = 1
		updateServiceConfig()

		const thread = createThreadWithTurns(service, store, 2, {
			assistantContent: 'Large assistant reply kept in the retained tail.',
			userContent: 'Large user request kept in the retained tail.'
		})

		const result = await service.compactConversation(thread.conversation.id)
		const checkpoint = store.getConversationCompaction(thread.conversation.id)

		expect(result).toEqual({ compacted: true, conversationId: thread.conversation.id, reason: 'updated' })
		expect(checkpoint?.summary).toBe('Checkpoint summary from manual size pressure.')
	} finally {
		store.close()
	}
})

test('auto-compacts when the raw suffix exceeds the configured turn threshold', async () => {
	mockFireworksScenarioResponses([
		{
			body: {
				choices: [{ message: { content: 'Checkpoint summary for older turns.' } }],
				id: 'chatcmpl_compact_auto_turns',
				model: 'accounts/fireworks/models/kimi-k2p5'
			},
			kind: 'json'
		},
		{
			body: {
				choices: [{ message: { content: 'Final reply after compaction.' } }],
				id: 'chatcmpl_compact_auto_turns_reply',
				model: 'accounts/fireworks/models/kimi-k2p5'
			},
			kind: 'json'
		}
	])

	const { service, store, writableConfig, updateServiceConfig } = createAgentServiceContext(
		'kestrion-agent-service-compact-auto-turns-'
	)

	try {
		writableConfig.providers.fireworks.compactTailTurns = 1
		writableConfig.providers.fireworks.compactAutoTurnThreshold = 1
		updateServiceConfig()

		const existingThread = createThreadWithTurns(service, store, 2)
		const withLatestUserPrompt = service.addUserMessage(existingThread.conversation.id, 'Turn 3 request')
		const replyThread = await service.generateAssistantReply(withLatestUserPrompt.conversation.id)
		const checkpoint = store.getConversationCompaction(withLatestUserPrompt.conversation.id)

		expect(checkpoint?.summary).toBe('Checkpoint summary for older turns.')
		expect(replyThread.messages.at(-1)?.content).toBe('Final reply after compaction.')
		expect(readMockFireworksScenarioRequests()).toHaveLength(2)
	} finally {
		store.close()
	}
})

test('auto-compacts from prompt-size pressure even when the raw suffix is within the retained tail', async () => {
	mockFireworksScenarioResponses([
		{
			body: {
				choices: [{ message: { content: 'Checkpoint summary from retained-tail size pressure.' } }],
				id: 'chatcmpl_compact_auto_chars_tail',
				model: 'accounts/fireworks/models/kimi-k2p5'
			},
			kind: 'json'
		},
		{
			body: {
				choices: [{ message: { content: 'Reply after retained-tail size compaction.' } }],
				id: 'chatcmpl_compact_auto_chars_tail_reply',
				model: 'accounts/fireworks/models/kimi-k2p5'
			},
			kind: 'json'
		}
	])

	const { service, store, writableConfig, updateServiceConfig } = createAgentServiceContext(
		'kestrion-agent-service-compact-auto-chars-tail-'
	)

	try {
		writableConfig.providers.fireworks.compactAutoTurnThreshold = 99
		writableConfig.providers.fireworks.compactAutoPromptChars = 1
		updateServiceConfig()

		const existingThread = createThreadWithTurns(service, store, 1, {
			assistantContent: 'Existing assistant reply with retained-tail prompt pressure.',
			userContent: 'Existing user request with retained-tail prompt pressure.'
		})
		const withLatestUserPrompt = service.addUserMessage(
			existingThread.conversation.id,
			'Latest request still needs the newest turn kept raw.'
		)
		const replyThread = await service.generateAssistantReply(withLatestUserPrompt.conversation.id)

		expect(store.getConversationCompaction(withLatestUserPrompt.conversation.id)?.summary).toBe(
			'Checkpoint summary from retained-tail size pressure.'
		)
		expect(replyThread.messages.at(-1)?.content).toBe('Reply after retained-tail size compaction.')
		expect(readMockFireworksScenarioRequests()).toHaveLength(2)
	} finally {
		store.close()
	}
})

test('auto-compacts when the raw suffix exceeds the configured prompt-size threshold', async () => {
	mockFireworksScenarioResponses([
		{
			body: {
				choices: [{ message: { content: 'Checkpoint summary from the size trigger.' } }],
				id: 'chatcmpl_compact_auto_chars',
				model: 'accounts/fireworks/models/kimi-k2p5'
			},
			kind: 'json'
		},
		{
			body: {
				choices: [{ message: { content: 'Reply after size-triggered compaction.' } }],
				id: 'chatcmpl_compact_auto_chars_reply',
				model: 'accounts/fireworks/models/kimi-k2p5'
			},
			kind: 'json'
		}
	])

	const { service, store, writableConfig, updateServiceConfig } = createAgentServiceContext(
		'kestrion-agent-service-compact-auto-chars-'
	)

	try {
		writableConfig.providers.fireworks.compactTailTurns = 1
		writableConfig.providers.fireworks.compactAutoTurnThreshold = 99
		writableConfig.providers.fireworks.compactAutoPromptChars = 80
		updateServiceConfig()

		const existingThread = createThreadWithTurns(service, store, 1, {
			assistantContent: 'Existing assistant reply with a lot of context carried forward.',
			userContent: 'Existing user request with a lot of context carried forward.'
		})
		const withLatestUserPrompt = service.addUserMessage(
			existingThread.conversation.id,
			'New request with enough content to trigger prompt-size based compaction.'
		)
		await service.generateAssistantReply(withLatestUserPrompt.conversation.id)

		expect(store.getConversationCompaction(withLatestUserPrompt.conversation.id)?.summary).toBe(
			'Checkpoint summary from the size trigger.'
		)
		expect(readMockFireworksScenarioRequests()).toHaveLength(2)
	} finally {
		store.close()
	}
})

function writeMatrixPrompt(configDir: string): void {
	writeFileSync(join(configDir, 'MATRIX.md'), '# Matrix\n\nUse the shared agent rules.\n')
}

function createAgentServiceContext(prefix: string): {
	paths: ReturnType<typeof resolveAppPaths>
	service: AgentService
	store: ConversationStore
	updateServiceConfig: () => void
	writableConfig: ReturnType<typeof loadWritableAppConfig>
} {
	const homeDir = mkdtempSync(join(tmpdir(), prefix))
	cleanupPaths.push(homeDir)

	const paths = resolveAppPaths({ homeDir, runtimeDir: `${homeDir}/.runtime/kestrion` })
	writeMatrixPrompt(paths.configDir)
	const writableConfig = loadWritableAppConfig(paths)
	writableConfig.providers.fireworks.providerMode = 'fireworks'
	writableConfig.providers.fireworks.apiKey = 'test-api-key'
	let config = saveAppConfig(paths, writableConfig)
	const store = new ConversationStore(paths.databaseFile)
	const service = new AgentService(store, config)

	return {
		paths,
		service,
		store,
		updateServiceConfig: () => {
			config = saveAppConfig(paths, writableConfig)
			service.updateConfig(config)
		},
		writableConfig
	}
}

function createThreadWithTurns(
	service: AgentService,
	store: ConversationStore,
	turnCount: number,
	options: { assistantContent?: string; userContent?: string } = {}
) {
	let thread = service.createDraftConversation()

	for (let index = 0; index < turnCount; index += 1) {
		const userContent = options.userContent ?? `Turn ${index + 1} request`
		const assistantContent = options.assistantContent ?? `Turn ${index + 1} reply`
		thread = service.addUserMessage(thread.conversation.id, userContent)
		store.appendMessage({
			content: assistantContent,
			conversationId: thread.conversation.id,
			model: thread.conversation.model,
			provider: thread.conversation.provider,
			role: 'assistant'
		})
		thread = service.loadConversation(thread.conversation.id)
	}

	return thread
}
