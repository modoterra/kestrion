import { afterEach, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { executeGlobTool } from './glob'

const cleanupPaths: string[] = []

afterEach(() => {
	for (const path of cleanupPaths.splice(0).toReversed()) {
		rmSync(path, { force: true, recursive: true })
	}
})

test('finds workspace files with a glob pattern', () => {
	const workspaceRoot = createTemporaryDirectory('kestrion-glob-workspace-')
	mkdirSync(join(workspaceRoot, 'src/components'), { recursive: true })
	writeFileSync(join(workspaceRoot, 'src/components/view.tsx'), '')
	writeFileSync(join(workspaceRoot, 'src/index.ts'), '')
	writeFileSync(join(workspaceRoot, 'README.md'), '')

	const result = JSON.parse(
		executeGlobTool(JSON.stringify({ pattern: '**/*.{ts,tsx}', path: 'src' }), { workspaceRoot })
	) as { matches: string[]; ok: boolean }

	expect(result.ok).toBe(true)
	expect(result.matches).toEqual(['src/components/view.tsx', 'src/index.ts'])
})

function createTemporaryDirectory(prefix: string): string {
	const path = mkdtempSync(join(tmpdir(), prefix))
	cleanupPaths.push(path)

	return path
}
