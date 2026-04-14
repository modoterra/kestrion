import { afterEach, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { executeSearchTool } from './search'

const cleanupPaths: string[] = []

afterEach(() => {
	for (const path of cleanupPaths.splice(0).toReversed()) {
		rmSync(path, { force: true, recursive: true })
	}
})

test('searches workspace file paths by substring', () => {
	const workspaceRoot = createTemporaryDirectory('kestrion-search-workspace-')
	mkdirSync(join(workspaceRoot, 'src/components'), { recursive: true })
	mkdirSync(join(workspaceRoot, 'src/lib'), { recursive: true })
	writeFileSync(join(workspaceRoot, 'src/components/message-bubble.tsx'), '')
	writeFileSync(join(workspaceRoot, 'src/lib/message-store.ts'), '')
	writeFileSync(join(workspaceRoot, 'README.md'), '')

	const result = JSON.parse(executeSearchTool(JSON.stringify({ query: 'message' }), { workspaceRoot })) as {
		matches: string[]
		ok: boolean
		query: string
	}

	expect(result.ok).toBe(true)
	expect(result.query).toBe('message')
	expect(result.matches).toContain('src/components/message-bubble.tsx')
	expect(result.matches).toContain('src/lib/message-store.ts')
})

test('can scope path searches to a subdirectory', () => {
	const workspaceRoot = createTemporaryDirectory('kestrion-search-workspace-')
	mkdirSync(join(workspaceRoot, 'src/components'), { recursive: true })
	mkdirSync(join(workspaceRoot, 'tests'), { recursive: true })
	writeFileSync(join(workspaceRoot, 'src/components/message-bubble.tsx'), '')
	writeFileSync(join(workspaceRoot, 'tests/message-bubble.test.ts'), '')

	const result = JSON.parse(
		executeSearchTool(JSON.stringify({ path: 'src', query: 'message' }), { workspaceRoot })
	) as { matches: string[]; ok: boolean }

	expect(result.ok).toBe(true)
	expect(result.matches).toEqual(['src/components/message-bubble.tsx'])
})

function createTemporaryDirectory(prefix: string): string {
	const path = mkdtempSync(join(tmpdir(), prefix))
	cleanupPaths.push(path)

	return path
}
