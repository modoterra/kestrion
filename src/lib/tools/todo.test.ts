import { Database } from 'bun:sqlite'
import { afterEach, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { resolveAppPaths } from '../paths'
import { executeTodoTool } from './todo'

const cleanupPaths: string[] = []

afterEach(() => {
	for (const path of cleanupPaths.splice(0).toReversed()) {
		rmSync(path, { force: true, recursive: true })
	}
})

test('adds and lists persistent todo items', () => {
	const appPaths = createAppPaths()

	const addResult = JSON.parse(
		executeTodoTool(JSON.stringify({ action: 'add', content: 'Ship the release', priority: 'high' }), { appPaths })
	) as { item: { content: string; id: string }; ok: boolean }

	const listResult = JSON.parse(executeTodoTool(JSON.stringify({ action: 'list' }), { appPaths })) as {
		items: Array<{ content: string; priority: string }>
		ok: boolean
		total: number
	}

	expect(addResult.ok).toBe(true)
	expect(addResult.item.content).toBe('Ship the release')
	expect(addResult.item.id).toBeString()
	expect(listResult.ok).toBe(true)
	expect(listResult.total).toBe(1)
	expect(listResult.items[0]?.content).toBe('Ship the release')
	expect(listResult.items[0]?.priority).toBe('high')

	const database = new Database(appPaths.databaseFile)
	const todoRows = database.prepare('SELECT content, priority FROM tool_todos').all() as Array<{
		content: string
		priority: string
	}>
	database.close()

	expect(todoRows).toEqual([{ content: 'Ship the release', priority: 'high' }])
})

function createAppPaths(): ReturnType<typeof resolveAppPaths> {
	const homeDir = mkdtempSync(join(tmpdir(), 'kestrion-todo-home-'))
	cleanupPaths.push(homeDir)
	return resolveAppPaths({ homeDir })
}
