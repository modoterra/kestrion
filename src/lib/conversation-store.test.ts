import { Database } from 'bun:sqlite'
import { afterEach, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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

test('migrates and seeds provider catalog data', () => {
	const tempDir = mkdtempSync(join(tmpdir(), 'kestrion-store-'))
	cleanupPaths.push(tempDir)

	const store = new ConversationStore(join(tempDir, 'kestrion.sqlite'))
	const providers = store.listProviders()
	const fireworksModels = store.listProviderModels('fireworks')
	store.close()

	expect(providers).toEqual([{ description: 'fireworks.ai', id: 'fireworks', label: 'Fireworks', sortOrder: 1 }])

	expect(fireworksModels.map(model => model.label)).toEqual([
		'Conversational',
		'Thinking',
		'Vision',
		'Budget',
		'Premium'
	])
	expect(fireworksModels.map(model => model.description)).toEqual([
		'Best default for everyday conversations and general tasks',
		'Best for deeper reasoning, planning, and tricky multi-step work',
		'Best for screenshots, images, and visual analysis',
		'Lower-cost option for lightweight tasks and higher-volume usage',
		'Alternate flagship chat model for side-by-side evaluation'
	])
	expect(fireworksModels.map(model => model.model)).toEqual([
		'accounts/fireworks/models/kimi-k2p5',
		'accounts/fireworks/models/kimi-k2-thinking',
		'accounts/fireworks/models/qwen3-vl-30b-a3b-thinking',
		'accounts/fireworks/models/deepseek-v3p2',
		'accounts/fireworks/models/qwen3p6-plus'
	])
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
			WHERE type = 'table' AND name IN ('tool_todos', 'tool_memory_entries', 'tool_scratch_memory', '__drizzle_migrations')
			ORDER BY name ASC`
		)
		.all() as Array<{ name: string }>
	database.close()

	expect(version).toBe(4)
	expect(drizzleMigrationCount.count).toBe(1)
	expect(tableNames.map(table => table.name)).toEqual([
		'__drizzle_migrations',
		'tool_memory_entries',
		'tool_scratch_memory',
		'tool_todos'
	])
})
