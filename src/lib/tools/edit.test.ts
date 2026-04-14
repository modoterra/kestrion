import { afterEach, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { executeEditTool } from './edit'

const cleanupPaths: string[] = []

afterEach(() => {
	for (const path of cleanupPaths.splice(0).toReversed()) {
		rmSync(path, { force: true, recursive: true })
	}
})

test('edits a workspace file by exact text replacement', () => {
	const workspaceRoot = createTemporaryDirectory('kestrion-edit-workspace-')
	writeFileSync(join(workspaceRoot, 'notes.txt'), 'alpha\nbeta\ngamma\n')

	const result = JSON.parse(
		executeEditTool(JSON.stringify({ newText: 'BETA', oldText: 'beta', path: 'notes.txt' }), { workspaceRoot })
	) as { ok: boolean; replacements: number }

	expect(result.ok).toBe(true)
	expect(result.replacements).toBe(1)
	expect(readFileSync(join(workspaceRoot, 'notes.txt'), 'utf8')).toBe('alpha\nBETA\ngamma\n')
})

function createTemporaryDirectory(prefix: string): string {
	const path = mkdtempSync(join(tmpdir(), prefix))
	cleanupPaths.push(path)

	return path
}
