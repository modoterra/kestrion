import { Database } from 'bun:sqlite'
import { afterEach, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createTestingToolPolicy } from '../tools/policy'
import { ConversationStore } from './conversation-store'

const cleanupPaths: string[] = []

afterEach(() => {
	for (const path of cleanupPaths.splice(0)) {
		rmSync(path, { force: true, recursive: true })
	}
})

test('persists conversations and messages in SQLite', () => {
	const tempDir = mkdtempSync(join(tmpdir(), 'kestrion-store-'))
	cleanupPaths.push(tempDir)

	const store = new ConversationStore(join(tempDir, 'kestrion.sqlite'))
	const thread = store.createConversation({ model: 'demo-model', provider: 'fireworks', title: 'Fresh session' })

	store.appendMessage({ content: 'Hello there', conversationId: thread.conversation.id, role: 'user' })
	store.appendMessage({
		content: 'General Kenobi',
		conversationId: thread.conversation.id,
		model: 'demo-model',
		provider: 'fireworks',
		role: 'assistant'
	})

	const storedThread = store.getConversation(thread.conversation.id)
	const summaries = store.listConversations()
	store.close()

	expect(storedThread).not.toBeNull()
	expect(storedThread?.messages.map(message => message.role)).toEqual(['user', 'assistant'])
	expect(summaries[0]?.messageCount).toBe(2)
	expect(summaries[0]?.preview).toBe('General Kenobi')
})

test('updates the stored provider and model for an existing conversation', () => {
	const tempDir = mkdtempSync(join(tmpdir(), 'kestrion-store-'))
	cleanupPaths.push(tempDir)

	const store = new ConversationStore(join(tempDir, 'kestrion.sqlite'))
	const thread = store.createConversation({ model: 'demo-model', provider: 'fireworks', title: 'Fresh session' })

	store.updateConversationInference(thread.conversation.id, 'fireworks', 'next-model')

	const storedThread = store.getConversation(thread.conversation.id)
	store.close()

	expect(storedThread?.conversation.provider).toBe('fireworks')
	expect(storedThread?.conversation.model).toBe('next-model')
})

test('persists tool call transcript rows alongside the conversation thread', () => {
	const tempDir = mkdtempSync(join(tmpdir(), 'kestrion-store-'))
	cleanupPaths.push(tempDir)

	const store = new ConversationStore(join(tempDir, 'kestrion.sqlite'))
	const thread = store.createConversation({ model: 'demo-model', provider: 'fireworks', title: 'Tooling session' })
	const toolCallMessage = store.appendToolCallMessage({
		conversationId: thread.conversation.id,
		toolCalls: [{ argumentsJson: '{"path":"/agent/notes.txt"}', id: 'tool-read', name: 'read' }]
	})

	store.markToolCallMessageCompleted(toolCallMessage.id)

	const storedThread = store.getConversation(thread.conversation.id)
	store.close()

	expect(storedThread?.toolCallMessages).toEqual([
		expect.objectContaining({
			conversationId: thread.conversation.id,
			id: toolCallMessage.id,
			status: 'completed',
			toolCalls: [expect.objectContaining({ name: 'read' })]
		})
	])
})

test('persists worker transcript entries in stable turn and sequence order', () => {
	const tempDir = mkdtempSync(join(tmpdir(), 'kestrion-store-'))
	cleanupPaths.push(tempDir)

	const store = new ConversationStore(join(tempDir, 'kestrion.sqlite'))
	const thread = store.createConversation({ model: 'demo-model', provider: 'fireworks', title: 'Transcript session' })

	store.appendWorkerTranscriptEntry({
		conversationId: thread.conversation.id,
		createdAt: '2026-04-15T12:00:01.000Z',
		direction: 'daemonToWorker',
		kind: 'turnInput',
		payloadJson: '{"turn":"b"}',
		sequence: 0,
		turnId: 'turn-b'
	})
	store.appendWorkerTranscriptEntry({
		conversationId: thread.conversation.id,
		createdAt: '2026-04-15T12:00:00.000Z',
		direction: 'daemonToWorker',
		kind: 'turnInput',
		payloadJson: '{"turn":"a"}',
		sequence: 0,
		turnId: 'turn-a'
	})
	store.appendWorkerTranscriptEntry({
		conversationId: thread.conversation.id,
		createdAt: '2026-04-15T12:00:00.000Z',
		direction: 'workerToDaemon',
		kind: 'workerEvent',
		payloadJson: '{"delta":"Hello"}',
		sequence: 1,
		turnId: 'turn-a'
	})

	const transcript = store.listConversationWorkerTranscript(thread.conversation.id)
	store.close()

	expect(transcript.map(entry => `${entry.turnId}:${entry.sequence}`)).toEqual(['turn-a:0', 'turn-a:1', 'turn-b:0'])
})

test('migrates and seeds provider catalog data', () => {
	const tempDir = mkdtempSync(join(tmpdir(), 'kestrion-store-'))
	cleanupPaths.push(tempDir)

	const store = new ConversationStore(join(tempDir, 'kestrion.sqlite'))
	const providers = store.listProviders()
	const fireworksModels = store.listProviderModels('fireworks')
	store.close()

	expect(providers).toEqual([{ description: 'fireworks.ai', id: 'fireworks', label: 'Fireworks', sortOrder: 1 }])

	expect(fireworksModels.map(model => model.label)).toEqual(['Kimi K2.5'])
	expect(fireworksModels.map(model => model.description)).toEqual([
		'Curated Kimi profile with automatic Instant and Thinking mode switching'
	])
	expect(fireworksModels.map(model => model.model)).toEqual(['accounts/fireworks/models/kimi-k2p5'])
})

test('migrates the shared database with tool storage tables', () => {
	const tempDir = mkdtempSync(join(tmpdir(), 'kestrion-store-'))
	cleanupPaths.push(tempDir)
	const databaseFile = join(tempDir, 'kestrion.sqlite')

	const store = new ConversationStore(databaseFile)
	store.close()

	const database = new Database(databaseFile)
	const drizzleMigrationCount = database.prepare('SELECT COUNT(*) AS count FROM "__drizzle_migrations"').get() as {
		count: number
	}
	const version = (database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
	const tableNames = database
		.prepare(
			`SELECT name
			FROM sqlite_master
			WHERE type = 'table' AND name IN (
				'conversation_tool_calls',
				'conversation_worker_transcript',
				'tool_policy',
				'tool_todos',
				'tool_memory_entries',
				'tool_scratch_memory',
				'__drizzle_migrations'
			)
			ORDER BY name ASC`
		)
		.all() as Array<{ name: string }>
	database.close()

	expect(version).toBe(5)
	expect(drizzleMigrationCount.count).toBe(4)
	expect(tableNames.map(table => table.name)).toEqual([
		'__drizzle_migrations',
		'conversation_tool_calls',
		'conversation_worker_transcript',
		'tool_memory_entries',
		'tool_policy',
		'tool_scratch_memory',
		'tool_todos'
	])
})

test('loads a deny-all tool policy when no policy row exists', () => {
	const tempDir = mkdtempSync(join(tmpdir(), 'kestrion-store-'))
	cleanupPaths.push(tempDir)

	const store = new ConversationStore(join(tempDir, 'kestrion.sqlite'))
	const policy = store.loadToolPolicy()
	store.close()

	expect(policy.tools.read.readRoots).toEqual([])
	expect(policy.tools.write.writeRoots).toEqual([])
	expect(policy.tools.todo.allowed).toBeFalse()
})

test('persists and reloads the tool policy singleton', () => {
	const tempDir = mkdtempSync(join(tmpdir(), 'kestrion-store-'))
	cleanupPaths.push(tempDir)

	const store = new ConversationStore(join(tempDir, 'kestrion.sqlite'))
	store.saveToolPolicy(createTestingToolPolicy())
	const policy = store.loadToolPolicy()
	store.close()

	expect(policy.tools.read.readRoots).toEqual(['/agent', '/config'])
	expect(policy.tools.write.writeRoots).toEqual(['/agent'])
	expect(policy.tools.remember.allowedMemoryKinds).toEqual(['scratch', 'episodic', 'long-term'])
	expect(policy.tools.todo.allowed).toBeTrue()
})
