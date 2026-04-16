import { expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { DEV_SEED_CONVERSATIONS } from '../db/seeds/dev'
import { resolveAppPaths } from '../lib/paths'
import { ConversationStore } from '../lib/storage/conversation-store'
import { loadMemorySnapshot } from '../lib/storage/memory-store'
import { runTodoTool } from '../lib/tools/todo'
import { ensureDevSeedData } from './dev-seed'

test('ensureDevSeedData bootstraps rich dev fixtures into an empty runtime', () => {
	const homeDir = mkdtempSync(join(tmpdir(), 'kestrion-dev-seed-'))

	try {
		const paths = resolveAppPaths({ configRootName: 'config', dataRootName: 'share', homeDir, runtimeDir: homeDir })

		ensureDevSeedData(paths)

		assertSeededConversations(paths.databaseFile)

		const memory = loadMemorySnapshot(paths)
		expect(memory.scratch).toContain('Temporary notes live here')
		expect(memory.episodic).toEqual([expect.objectContaining({ title: 'Communication style' })])
		expect(memory.longTerm).toEqual([expect.objectContaining({ title: 'List organization habit' })])

		const todos = runTodoTool({ action: 'list' }, { appPaths: paths })
		expect(todos).toMatchObject({ ok: true })
		expect('items' in todos && todos.items.map(item => item.content)).toContain('Pick a dinner recipe for the weekend')
		expect('items' in todos && todos.items.map(item => item.content)).toContain('Book an annual eye exam')

		expect(readFileSync(join(paths.configDir, 'MATRIX.md'), 'utf8')).toContain('# MATRIX')
		expect(readFileSync(join(paths.skillsDir, 'release-notes', 'SKILL.md'), 'utf8')).toContain('Release Notes')
	} finally {
		rmSync(homeDir, { force: true, recursive: true })
	}
})

test('ensureDevSeedData leaves an already-populated runtime alone', () => {
	const homeDir = mkdtempSync(join(tmpdir(), 'kestrion-dev-seed-existing-'))

	try {
		const paths = resolveAppPaths({ configRootName: 'config', dataRootName: 'share', homeDir, runtimeDir: homeDir })

		ensureDevSeedData(paths)
		const store = new ConversationStore(paths.databaseFile)
		const initialConversationCount = store.listConversations(20).length
		store.close()

		ensureDevSeedData(paths)

		const nextStore = new ConversationStore(paths.databaseFile)
		try {
			expect(nextStore.listConversations(20).length).toBe(initialConversationCount)
		} finally {
			nextStore.close()
		}
	} finally {
		rmSync(homeDir, { force: true, recursive: true })
	}
})

test('ensureDevSeedData backfills missing tool-call and transcript rows into an existing seeded runtime', () => {
	const homeDir = mkdtempSync(join(tmpdir(), 'kestrion-dev-seed-backfill-'))

	try {
		const paths = resolveAppPaths({ configRootName: 'config', dataRootName: 'share', homeDir, runtimeDir: homeDir })
		const store = new ConversationStore(paths.databaseFile)

		try {
			const thread = store.createConversation({
				model: 'accounts/fireworks/models/kimi-k2p5',
				provider: 'fireworks',
				title: 'Show me something tool-heavy.'
			})
			store.appendMessage({
				content: 'Show me something tool-heavy.',
				conversationId: thread.conversation.id,
				role: 'user'
			})
			store.appendMessage({
				content: 'Older dev runtimes already had this saved conversation.',
				conversationId: thread.conversation.id,
				role: 'assistant'
			})
		} finally {
			store.close()
		}

		ensureDevSeedData(paths)
		assertSeededToolCalls(paths.databaseFile)
		assertToolHeavyTranscript(paths.databaseFile)
	} finally {
		rmSync(homeDir, { force: true, recursive: true })
	}
})

function assertSeededConversations(databaseFile: string): void {
	const store = new ConversationStore(databaseFile)

	try {
		const conversations = store.listConversations(10)
		expect(conversations.length).toBeGreaterThanOrEqual(DEV_SEED_CONVERSATIONS.length)
		expect(conversations.some(conversation => conversation.title.includes('What does a failure look like'))).toBe(true)
		expect(conversations.some(conversation => conversation.preview?.includes('That is exactly what this'))).toBe(true)
		assertSeededToolCalls(databaseFile, store)
		assertSeededWorkerTranscript(databaseFile, store)
	} finally {
		store.close()
	}
}

function assertSeededToolCalls(databaseFile: string, existingStore?: ConversationStore): void {
	const store = existingStore ?? new ConversationStore(databaseFile)

	try {
		const conversations = store.listConversations(10)
		const toolHeavyConversation = conversations.find(conversation => conversation.title.includes('Show me something'))
		expect(toolHeavyConversation).toBeDefined()
		expect(store.getConversation(toolHeavyConversation?.id ?? '')?.toolCallMessages).toEqual([
			expect.objectContaining({
				status: 'completed',
				toolCalls: [expect.objectContaining({ name: 'read' }), expect.objectContaining({ name: 'grep' })]
			}),
			expect.objectContaining({ status: 'completed', toolCalls: [expect.objectContaining({ name: 'remember' })] })
		])
	} finally {
		if (!existingStore) {
			store.close()
		}
	}
}

function assertSeededWorkerTranscript(databaseFile: string, existingStore?: ConversationStore): void {
	const store = existingStore ?? new ConversationStore(databaseFile)

	try {
		const conversations = store.listConversations(10)

		for (const fixture of DEV_SEED_CONVERSATIONS) {
			const firstUserMessage = fixture.messages.find(message => message.role === 'user')?.content
			const conversationTitle = firstUserMessage ? toSeedConversationTitle(firstUserMessage) : undefined
			expect(conversationTitle).toBeDefined()

			const conversation = conversations.find(item => item.title === conversationTitle)
			expect(conversation).toBeDefined()
			expect(store.listConversationWorkerTranscript(conversation?.id ?? '')).toHaveLength(
				fixture.workerTranscriptEntries?.length ?? 0
			)
		}

		assertToolHeavyTranscript(databaseFile, store)
		assertFailureTranscript(databaseFile, store)
	} finally {
		if (!existingStore) {
			store.close()
		}
	}
}

function assertToolHeavyTranscript(databaseFile: string, existingStore?: ConversationStore): void {
	const store = existingStore ?? new ConversationStore(databaseFile)

	try {
		const toolHeavyConversation = store
			.listConversations(10)
			.find(conversation => conversation.title.includes('Show me something'))
		expect(toolHeavyConversation).toBeDefined()
		expect(store.listConversationWorkerTranscript(toolHeavyConversation?.id ?? '')).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ kind: 'hostToolRequest' }),
				expect.objectContaining({ kind: 'hostToolResponse' })
			])
		)
	} finally {
		if (!existingStore) {
			store.close()
		}
	}
}

function assertFailureTranscript(databaseFile: string, existingStore?: ConversationStore): void {
	const store = existingStore ?? new ConversationStore(databaseFile)

	try {
		const failureConversation = store
			.listConversations(10)
			.find(conversation => conversation.title.includes('What does a failure look like'))
		expect(failureConversation).toBeDefined()
		expect(store.listConversationWorkerTranscript(failureConversation?.id ?? '')).toEqual(
			expect.arrayContaining([expect.objectContaining({ kind: 'hostToolError' })])
		)
	} finally {
		if (!existingStore) {
			store.close()
		}
	}
}

function toSeedConversationTitle(content: string): string {
	const singleLine = content.replaceAll(/\s+/g, ' ').trim()
	if (!singleLine) {
		return 'Fresh session'
	}

	if (singleLine.length <= 48) {
		return singleLine
	}

	return `${singleLine.slice(0, 45)}...`
}
