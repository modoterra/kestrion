import { afterEach, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { executeReadTool } from './read'

const cleanupPaths: string[] = []

afterEach(() => {
	for (const path of cleanupPaths.splice(0).toReversed()) {
		rmSync(path, { force: true, recursive: true })
	}
})

test('reads a workspace file with line ranges', () => {
	const workspaceRoot = createTemporaryDirectory('kestrion-read-workspace-')
	writeFileSync(join(workspaceRoot, 'notes.txt'), 'alpha\nbeta\ngamma\ndelta\n')

	const result = JSON.parse(
		executeReadTool(JSON.stringify({ endLine: 3, path: 'notes.txt', startLine: 2 }), { workspaceRoot })
	) as { content: string; endLine: number; ok: boolean; path: string; startLine: number; totalLines: number }

	expect(result.ok).toBe(true)
	expect(result.path).toBe('notes.txt')
	expect(result.startLine).toBe(2)
	expect(result.endLine).toBe(3)
	expect(result.totalLines).toBe(4)
	expect(result.content).toBe('beta\ngamma')
})

test('rejects paths outside the workspace root', () => {
	const workspaceRoot = createTemporaryDirectory('kestrion-read-workspace-')
	const outsideRoot = createTemporaryDirectory('kestrion-read-outside-')
	writeFileSync(join(outsideRoot, 'secret.txt'), 'classified\n')

	const result = JSON.parse(
		executeReadTool(JSON.stringify({ path: join(outsideRoot, 'secret.txt') }), { workspaceRoot })
	) as { error: string; ok: boolean; path?: string }

	expect(result.ok).toBe(false)
	expect(result.path).toContain('secret.txt')
	expect(result.error).toContain('outside the workspace root')
})

function createTemporaryDirectory(prefix: string): string {
	const path = mkdtempSync(join(tmpdir(), prefix))
	cleanupPaths.push(path)

	return path
}
