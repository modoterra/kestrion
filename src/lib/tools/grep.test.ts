import { afterEach, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { executeGrepTool } from './grep'

const cleanupPaths: string[] = []

afterEach(() => {
	for (const path of cleanupPaths.splice(0).toReversed()) {
		rmSync(path, { force: true, recursive: true })
	}
})

test('greps workspace file contents', () => {
	const workspaceRoot = createTemporaryDirectory('kestrion-grep-workspace-')
	mkdirSync(join(workspaceRoot, 'src'), { recursive: true })
	writeFileSync(join(workspaceRoot, 'src/one.ts'), 'const greeting = "hello world"\n')
	writeFileSync(join(workspaceRoot, 'src/two.ts'), 'const label = "HELLO AGAIN"\n')

	const result = JSON.parse(executeGrepTool(JSON.stringify({ query: 'hello' }), { workspaceRoot })) as {
		matches: Array<{ line: number; path: string; text: string }>
		ok: boolean
		query: string
	}

	expect(result.ok).toBe(true)
	expect(result.query).toBe('hello')
	expect(result.matches.some(match => match.path === 'src/one.ts')).toBe(true)
	expect(result.matches.some(match => match.path === 'src/two.ts')).toBe(true)
})

test('can scope grep to a subdirectory', () => {
	const workspaceRoot = createTemporaryDirectory('kestrion-grep-workspace-')
	mkdirSync(join(workspaceRoot, 'src'), { recursive: true })
	mkdirSync(join(workspaceRoot, 'docs'), { recursive: true })
	writeFileSync(join(workspaceRoot, 'src/app.ts'), 'search target\n')
	writeFileSync(join(workspaceRoot, 'docs/guide.md'), 'search target\n')

	const result = JSON.parse(
		executeGrepTool(JSON.stringify({ path: 'src', query: 'search target' }), { workspaceRoot })
	) as { matches: Array<{ line: number; path: string; text: string }>; ok: boolean }

	expect(result.ok).toBe(true)
	expect(result.matches).toEqual([{ line: 1, path: 'src/app.ts', text: 'search target' }])
})

function createTemporaryDirectory(prefix: string): string {
	const path = mkdtempSync(join(tmpdir(), prefix))
	cleanupPaths.push(path)

	return path
}
