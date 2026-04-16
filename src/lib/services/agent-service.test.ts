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

function writeMatrixPrompt(configDir: string): void {
	writeFileSync(join(configDir, 'MATRIX.md'), '# Matrix\n\nUse the shared agent rules.\n')
}
