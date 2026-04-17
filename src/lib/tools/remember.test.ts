import { Database } from 'bun:sqlite'
import { afterEach, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { openAppDatabaseConnection } from '../../db'
import { signStructuredMemoryRecord } from '../integrity/memory'
import { resolveAppPaths } from '../paths'
import { loadMemorySnapshot } from '../storage/memory-store'
import { executeRememberTool } from './remember'

const cleanupPaths: string[] = []

afterEach(() => {
	for (const path of cleanupPaths.splice(0).toReversed()) {
		rmSync(path, { force: true, recursive: true })
	}
})

test('writes and reads signed scratch memory', () => {
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
	const row = database
		.prepare(
			'SELECT content, integrity_state AS integrityState, signer_key_id AS signerKeyId, signature FROM tool_scratch_memory WHERE id = 1'
		)
		.get() as { content: string; integrityState: string; signature: string; signerKeyId: string } | null
	database.close()

	expect(row?.content).toBe('alpha')
	expect(row?.integrityState).toBe('valid')
	expect(row?.signerKeyId).not.toBe('')
	expect(row?.signature).not.toBe('')
})

test('stores and lists signed episodic memories', () => {
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
		.prepare(
			'SELECT kind, content, tags_json AS tagsJson, integrity_state AS integrityState, signer_key_id AS signerKeyId, signature FROM tool_memory_entries WHERE kind = ?'
		)
		.get('episodic') as {
		content: string
		integrityState: string
		kind: string
		signature: string
		signerKeyId: string
		tagsJson: string
	} | null
	database.close()

	expect(row?.kind).toBe('episodic')
	expect(row?.content).toBe('Investigated the parser bug')
	expect(row?.tagsJson).toBe('["debug"]')
	expect(row?.integrityState).toBe('valid')
	expect(row?.signerKeyId).not.toBe('')
	expect(row?.signature).not.toBe('')
})

test('suppresses unsigned legacy structured memory from trusted reads', () => {
	const appPaths = createAppPaths()
	const connection = openAppDatabaseConnection(appPaths.databaseFile)
	connection.client.close()
	const database = new Database(appPaths.databaseFile)

	database
		.prepare(
			`INSERT INTO tool_memory_entries
			 (content, created_at, id, kind, tags_json, title)
			 VALUES (?, ?, ?, ?, ?, ?)`
		)
		.run('legacy memory', '2026-04-01T00:00:00.000Z', 'legacy', 'episodic', '[]', '')
	database.close()

	const listResult = JSON.parse(
		executeRememberTool(JSON.stringify({ action: 'list', memory: 'episodic' }), { appPaths })
	) as { entries: unknown[]; ok: boolean; total: number }

	expect(listResult.ok).toBe(true)
	expect(listResult.total).toBe(0)
	expect(loadMemorySnapshot(appPaths).episodic).toEqual([])
})

test('suppresses stale signed memory from trusted reads', () => {
	const appPaths = createAppPaths()
	const connection = openAppDatabaseConnection(appPaths.databaseFile)
	connection.client.close()
	const database = new Database(appPaths.databaseFile)
	const createdAt = '2026-04-01T00:00:00.000Z'
	const signature = signStructuredMemoryRecord(appPaths, {
		content: 'stale memory',
		createdAt,
		id: 'stale-entry',
		kind: 'long-term',
		origin: { conversationId: 'c1', model: 'm1', provider: 'fireworks', toolName: 'remember', turnId: 't1' },
		tags: ['ops'],
		title: 'Stale'
	})

	database
		.prepare(
			`INSERT INTO tool_memory_entries
			 (content, created_at, id, integrity_state, kind, last_validated_at, origin_json, signature, signer_key_id, stale_after, tags_json, title)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.run(
			'stale memory',
			createdAt,
			'stale-entry',
			signature.integrityState,
			'long-term',
			signature.lastValidatedAt,
			signature.originJson,
			signature.signature,
			signature.signerKeyId,
			'2026-04-08T00:00:00.000Z',
			'["ops"]',
			'Stale'
		)
	database.close()

	const result = JSON.parse(
		executeRememberTool(JSON.stringify({ action: 'list', memory: 'long-term' }), { appPaths })
	) as { entries: unknown[]; ok: boolean; total: number }

	expect(result.ok).toBe(true)
	expect(result.total).toBe(0)
	expect(loadMemorySnapshot(appPaths).longTerm).toEqual([])
})

test('blocks remember when the deny kill switch is active', () => {
	const appPaths = createAppPaths()
	writeFileSync(appPaths.denyFile, '')

	const result = JSON.parse(
		executeRememberTool(JSON.stringify({ action: 'read', memory: 'scratch' }), { appPaths })
	) as { error: string; ok: boolean }

	expect(result.ok).toBe(false)
	expect(result.error).toContain('deny kill switch')
})

function createAppPaths(): ReturnType<typeof resolveAppPaths> {
	const homeDir = mkdtempSync(join(tmpdir(), 'kestrion-memory-home-'))
	cleanupPaths.push(homeDir)
	return resolveAppPaths({ homeDir })
}
