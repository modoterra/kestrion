import { Database } from 'bun:sqlite'
import { afterEach, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { resolveAppPaths } from '../paths'
import { executeRememberTool } from './remember'

const cleanupPaths: string[] = []

afterEach(() => {
	for (const path of cleanupPaths.splice(0).toReversed()) {
		rmSync(path, { force: true, recursive: true })
	}
})

test('writes and reads scratch memory', () => {
	const appPaths = createAppPaths()

	JSON.parse(
		executeRememberTool(JSON.stringify({ action: 'write', content: 'alpha', memory: 'scratch' }), { appPaths })
	) as { content: string; ok: boolean }

	const result = JSON.parse(
		executeRememberTool(JSON.stringify({ action: 'read', memory: 'scratch' }), { appPaths })
	) as { content: string; ok: boolean }

	expect(result.ok).toBe(true)
	expect(result.content).toBe('alpha')

	const database = new Database(appPaths.databaseFile)
	const row = database.prepare('SELECT content FROM tool_scratch_memory WHERE id = 1').get() as {
		content: string
	} | null
	database.close()

	expect(row?.content).toBe('alpha')
})

test('stores and lists episodic memories', () => {
	const appPaths = createAppPaths()

	JSON.parse(
		executeRememberTool(
			JSON.stringify({ action: 'write', content: 'Investigated the parser bug', memory: 'episodic', tags: ['debug'] }),
			{ appPaths }
		)
	)

	const result = JSON.parse(
		executeRememberTool(JSON.stringify({ action: 'list', memory: 'episodic' }), { appPaths })
	) as { entries: Array<{ content: string; tags: string[] }>; ok: boolean; total: number }

	expect(result.ok).toBe(true)
	expect(result.total).toBe(1)
	expect(result.entries[0]?.content).toBe('Investigated the parser bug')
	expect(result.entries[0]?.tags).toEqual(['debug'])

	const database = new Database(appPaths.databaseFile)
	const row = database
		.prepare('SELECT kind, content, tags_json AS tagsJson FROM tool_memory_entries WHERE kind = ?')
		.get('episodic') as { content: string; kind: string; tagsJson: string } | null
	database.close()

	expect(row?.kind).toBe('episodic')
	expect(row?.content).toBe('Investigated the parser bug')
	expect(row?.tagsJson).toBe('["debug"]')
})

function createAppPaths(): ReturnType<typeof resolveAppPaths> {
	const homeDir = mkdtempSync(join(tmpdir(), 'kestrion-memory-home-'))
	cleanupPaths.push(homeDir)
	return resolveAppPaths({ homeDir })
}
