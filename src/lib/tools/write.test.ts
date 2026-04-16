import { afterEach, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { executeWriteTool } from './write'

const cleanupPaths: string[] = []

afterEach(() => {
	for (const path of cleanupPaths.splice(0).toReversed()) {
		rmSync(path, { force: true, recursive: true })
	}
})

test('writes a workspace file', () => {
	const workspaceRoot = createTemporaryDirectory('kestrion-write-workspace-')

	const result = JSON.parse(
		executeWriteTool(JSON.stringify({ content: 'hello world\n', path: 'notes/output.txt' }), { workspaceRoot })
	) as { bytesWritten: number; ok: boolean; overwritten: boolean; path: string }

	expect(result.ok).toBe(true)
	expect(result.path).toBe('notes/output.txt')
	expect(result.bytesWritten).toBeGreaterThan(0)
	expect(result.overwritten).toBe(false)
	expect(readFileSync(join(workspaceRoot, 'notes/output.txt'), 'utf8')).toBe('hello world\n')
})

test('overwrites an existing workspace file', () => {
	const workspaceRoot = createTemporaryDirectory('kestrion-write-workspace-')

	executeWriteTool(JSON.stringify({ content: 'alpha\n', path: 'notes.txt' }), { workspaceRoot })
	const result = JSON.parse(
		executeWriteTool(JSON.stringify({ content: 'beta\n', path: 'notes.txt' }), { workspaceRoot })
	) as { ok: boolean; overwritten: boolean }

	expect(result.ok).toBe(true)
	expect(result.overwritten).toBe(true)
	expect(readFileSync(join(workspaceRoot, 'notes.txt'), 'utf8')).toBe('beta\n')
})

test('rejects writes outside the allowed sandbox root', () => {
	const agentRoot = createTemporaryDirectory('kestrion-write-agent-')
	const configRoot = createTemporaryDirectory('kestrion-write-config-')

	const result = JSON.parse(
		executeWriteTool(JSON.stringify({ content: 'denied\n', path: join(configRoot, 'blocked.txt') }), {
			fileAccessPolicy: { defaultReadRoot: agentRoot, readRoots: [agentRoot, configRoot], writeRoots: [agentRoot] }
		})
	) as { error: string; ok: boolean }

	expect(result.ok).toBe(false)
	expect(result.error).toContain('outside the allowed roots')
})

function createTemporaryDirectory(prefix: string): string {
	const path = mkdtempSync(join(tmpdir(), prefix))
	cleanupPaths.push(path)

	return path
}
