import { afterEach, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { AgentService, DRAFT_CONVERSATION_ID } from './agent-service'
import { loadWritableAppConfig, saveAppConfig } from './config'
import { ConversationStore } from './conversation-store'
import { resolveAppPaths } from './paths'

const cleanupPaths: string[] = []

afterEach(() => {
	for (const path of cleanupPaths.splice(0)) {
		rmSync(path, { force: true, recursive: true })
	}
})

test('keeps a fresh draft out of the database until the first message', () => {
	const tempDir = mkdtempSync(join(tmpdir(), 'kestrion-agent-'))
	cleanupPaths.push(tempDir)

	const paths = resolveAppPaths({ homeDir: tempDir })
	const writableConfig = loadWritableAppConfig(paths)
	writableConfig.providers.fireworks.apiKey = 'test-key'
	writableConfig.providers.fireworks.providerMode = 'fireworks'
	const config = saveAppConfig(paths, writableConfig)
	const store = new ConversationStore(paths.databaseFile)
	const service = new AgentService(store, config)

	const draft = service.createDraftConversation()
	expect(draft.conversation.id).toBe(DRAFT_CONVERSATION_ID)
	expect(service.listConversations()).toHaveLength(0)

	const saved = service.addUserMessage(draft.conversation.id, 'Hello from the first prompt')
	const summaries = service.listConversations()

	store.close()

	expect(saved.conversation.id).not.toBe(DRAFT_CONVERSATION_ID)
	expect(saved.messages).toHaveLength(1)
	expect(saved.messages[0]?.content).toBe('Hello from the first prompt')
	expect(summaries).toHaveLength(1)
	expect(summaries[0]?.title).toBe('Hello from the first prompt')
})

test('uses the latest saved conversation as the startup thread when one exists', () => {
	const tempDir = mkdtempSync(join(tmpdir(), 'kestrion-agent-'))
	cleanupPaths.push(tempDir)

	const paths = resolveAppPaths({ homeDir: tempDir })
	const writableConfig = loadWritableAppConfig(paths)
	writableConfig.providers.fireworks.apiKey = 'test-key'
	writableConfig.providers.fireworks.providerMode = 'fireworks'
	const config = saveAppConfig(paths, writableConfig)
	const store = new ConversationStore(paths.databaseFile)
	const service = new AgentService(store, config)

	const saved = service.addUserMessage(service.createDraftConversation().conversation.id, 'Resume this conversation')
	const startupThread = service.getStartupThread()

	store.close()

	expect(startupThread.conversation.id).toBe(saved.conversation.id)
	expect(startupThread.messages[0]?.content).toBe('Resume this conversation')
	expect(startupThread.conversation.id).not.toBe(DRAFT_CONVERSATION_ID)
})
