import { afterEach, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { executePatchTool } from './patch'

const cleanupPaths: string[] = []

afterEach(() => {
	for (const path of cleanupPaths.splice(0).toReversed()) {
		rmSync(path, { force: true, recursive: true })
	}
})

test('patches inclusive line ranges in a workspace file', () => {
	const workspaceRoot = createTemporaryDirectory('kestrion-patch-workspace-')
	writeFileSync(join(workspaceRoot, 'notes.txt'), 'one\ntwo\nthree\nfour\n')

	const result = JSON.parse(
		executePatchTool(
			JSON.stringify({ path: 'notes.txt', patches: [{ content: 'TWO\nTHREE', endLine: 3, startLine: 2 }] }),
			{ workspaceRoot }
		)
	) as { ok: boolean; patchesApplied: number }

	expect(result.ok).toBe(true)
	expect(result.patchesApplied).toBe(1)
	expect(readFileSync(join(workspaceRoot, 'notes.txt'), 'utf8')).toBe('one\nTWO\nTHREE\nfour\n')
})

function createTemporaryDirectory(prefix: string): string {
	const path = mkdtempSync(join(tmpdir(), prefix))
	cleanupPaths.push(path)

	return path
}
