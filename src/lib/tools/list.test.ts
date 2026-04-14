import { afterEach, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { executeListTool } from './list'

const cleanupPaths: string[] = []

afterEach(() => {
	for (const path of cleanupPaths.splice(0).toReversed()) {
		rmSync(path, { force: true, recursive: true })
	}
})

test('lists files and directories in a workspace path', () => {
	const workspaceRoot = createTemporaryDirectory('kestrion-list-workspace-')
	mkdirSync(join(workspaceRoot, 'src'), { recursive: true })
	writeFileSync(join(workspaceRoot, 'README.md'), '')
	writeFileSync(join(workspaceRoot, 'src/index.ts'), '')

	const result = JSON.parse(executeListTool(JSON.stringify({}), { workspaceRoot })) as {
		entries: Array<{ name: string; path: string; type: string }>
		ok: boolean
	}

	expect(result.ok).toBe(true)
	expect(result.entries).toEqual([
		{ name: 'README.md', path: 'README.md', type: 'file' },
		{ name: 'src', path: 'src', type: 'directory' }
	])
})

function createTemporaryDirectory(prefix: string): string {
	const path = mkdtempSync(join(tmpdir(), prefix))
	cleanupPaths.push(path)

	return path
}
