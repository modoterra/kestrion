import { afterEach, expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { authorizeToolCall, createTestingToolPolicy, DENY_ALL_TOOL_POLICY } from './policy'

const cleanupPaths: string[] = []

afterEach(() => {
	for (const path of cleanupPaths.splice(0)) {
		rmSync(path, { force: true, recursive: true })
	}
})

test('denies tool calls by default when no policy grants are present', () => {
	const tempDir = mkdtempSync(join(tmpdir(), 'kestrion-policy-'))
	const mounts = createHostMounts(tempDir)
	cleanupPaths.push(tempDir)

	const authorization = authorizeToolCall('read', '{"path":"notes.txt"}', DENY_ALL_TOOL_POLICY, mounts)

	expect(authorization.ok).toBe(false)
})

test('authorizes reads under an allowed root and rejects reads outside it', () => {
	const tempDir = mkdtempSync(join(tmpdir(), 'kestrion-policy-'))
	const mounts = createHostMounts(tempDir)
	cleanupPaths.push(tempDir)

	const allowResult = authorizeToolCall('read', '{"path":"notes.txt"}', createTestingToolPolicy(), mounts)
	const denyResult = authorizeToolCall('read', '{"path":"/root/secret.txt"}', createTestingToolPolicy(), mounts)

	expect(allowResult.ok).toBe(true)
	expect(denyResult.ok).toBe(false)
})

test('authorizes fetch only for exact allowlisted hostnames', () => {
	const tempDir = mkdtempSync(join(tmpdir(), 'kestrion-policy-'))
	const mounts = createHostMounts(tempDir)
	cleanupPaths.push(tempDir)

	const allowResult = authorizeToolCall(
		'fetch',
		'{"url":"https://example.com/docs"}',
		createTestingToolPolicy(),
		mounts
	)
	const denyResult = authorizeToolCall('fetch', '{"url":"https://openai.com"}', createTestingToolPolicy(), mounts)

	expect(allowResult.ok).toBe(true)
	expect(denyResult.ok).toBe(false)
})

test('authorizes remember by memory kind', () => {
	const tempDir = mkdtempSync(join(tmpdir(), 'kestrion-policy-'))
	const mounts = createHostMounts(tempDir)
	cleanupPaths.push(tempDir)

	const policy = createTestingToolPolicy()
	policy.tools.remember.allowedMemoryKinds = ['scratch']

	const allowResult = authorizeToolCall(
		'remember',
		'{"action":"write","memory":"scratch","content":"temporary note"}',
		policy,
		mounts
	)
	const denyResult = authorizeToolCall(
		'remember',
		'{"action":"write","memory":"long-term","content":"persistent note"}',
		policy,
		mounts
	)

	expect(allowResult.ok).toBe(true)
	expect(denyResult.ok).toBe(false)
})

function createHostMounts(tempDir: string): { agentRoot: string; configRoot: string } {
	const agentRoot = join(tempDir, 'agent')
	const configRoot = join(tempDir, 'config')
	mkdirSync(agentRoot, { recursive: true })
	mkdirSync(configRoot, { recursive: true })
	writeFileSync(join(agentRoot, 'notes.txt'), 'hello', 'utf8')
	writeFileSync(join(configRoot, 'config.json'), '{}', 'utf8')
	return { agentRoot, configRoot }
}
