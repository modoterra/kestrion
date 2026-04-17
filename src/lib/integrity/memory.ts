import { openAppDatabaseConnection } from '../../db'
import type { AppPaths } from '../paths'
import type { ToolMemoryKind, ToolMemoryOrigin } from '../tools/tool-types'
import { addDays, isTimestampExpired } from './common'
import { loadTrustedSigners, signPayload, verifyPayloadSignature } from './keys'
import type { IntegrityFinding, MemoryIntegrityState } from './types'

export const DEFAULT_MEMORY_STALE_DAYS = 7

export type MemoryOrigin = { conversationId: string; model: string; provider: string; toolName: string; turnId: string }

type StructuredMemoryRecord = {
	content: string
	createdAt: string
	id: string
	integrityState: string
	kind: string
	lastValidatedAt: string | null
	originJson: string
	signature: string
	signerKeyId: string
	staleAfter: string
	tagsJson: string
	title: string
}

type ScratchMemoryRecord = {
	content: string
	createdAt: string
	id: number
	integrityState: string
	lastValidatedAt: string | null
	originJson: string
	signature: string
	signerKeyId: string
	staleAfter: string
	updatedAt: string
}

type StructuredMemorySignatureInput = {
	content: string
	createdAt: string
	id: string
	kind: Extract<ToolMemoryKind, 'episodic' | 'long-term'>
	origin: MemoryOrigin
	tags: string[]
	title: string
}

type ScratchMemorySignatureInput = {
	content: string
	createdAt: string
	id: number
	origin: MemoryOrigin
	updatedAt: string
}

type ValidatedMemoryState = { findings: IntegrityFinding[]; state: MemoryIntegrityState; trusted: boolean }

export function buildMemoryOrigin(origin: ToolMemoryOrigin | undefined, fallbackToolName: string): MemoryOrigin {
	return {
		conversationId: origin?.conversationId?.trim() ?? '',
		model: origin?.model?.trim() ?? '',
		provider: origin?.provider?.trim() ?? '',
		toolName: origin?.toolName?.trim() || fallbackToolName,
		turnId: origin?.turnId?.trim() ?? ''
	}
}

export function signStructuredMemoryRecord(
	paths: AppPaths,
	input: StructuredMemorySignatureInput
): {
	integrityState: MemoryIntegrityState
	lastValidatedAt: string
	originJson: string
	signature: string
	signerKeyId: string
	staleAfter: string
} {
	const payload = buildStructuredMemoryPayload(input)
	const signed = signPayload(paths, payload)
	return {
		integrityState: 'valid',
		lastValidatedAt: input.createdAt,
		originJson: JSON.stringify(input.origin),
		signature: signed.signature,
		signerKeyId: signed.signerKeyId,
		staleAfter: addDays(input.createdAt, DEFAULT_MEMORY_STALE_DAYS)
	}
}

export function signScratchMemoryRecord(
	paths: AppPaths,
	input: ScratchMemorySignatureInput
): {
	integrityState: MemoryIntegrityState
	lastValidatedAt: string
	originJson: string
	signature: string
	signerKeyId: string
	staleAfter: string
} {
	const payload = buildScratchMemoryPayload(input)
	const signed = signPayload(paths, payload)
	return {
		integrityState: 'valid',
		lastValidatedAt: input.updatedAt,
		originJson: JSON.stringify(input.origin),
		signature: signed.signature,
		signerKeyId: signed.signerKeyId,
		staleAfter: addDays(input.updatedAt, DEFAULT_MEMORY_STALE_DAYS)
	}
}

export function refreshMemoryIntegrity(paths: AppPaths, nowIso = new Date().toISOString()): IntegrityFinding[] {
	const connection = openAppDatabaseConnection(paths.databaseFile)
	const database = connection.client
	const trustedSigners = loadTrustedSigners(paths)

	try {
		const findings: IntegrityFinding[] = []
		const rows = database
			.prepare(
				`SELECT content, created_at AS createdAt, id, integrity_state AS integrityState, kind, last_validated_at AS lastValidatedAt,
				 origin_json AS originJson, signature, signer_key_id AS signerKeyId, stale_after AS staleAfter,
				 tags_json AS tagsJson, title
				 FROM tool_memory_entries`
			)
			.all() as StructuredMemoryRecord[]
		for (const row of rows) {
			const validated = validateStructuredMemoryRecord(trustedSigners, row, nowIso)
			findings.push(...validated.findings)
			database
				.prepare(
					`UPDATE tool_memory_entries
					 SET integrity_state = ?, last_validated_at = ?
					 WHERE id = ?`
				)
				.run(validated.state, nowIso, row.id)
		}

		const scratchRows = database
			.prepare(
				`SELECT content, created_at AS createdAt, id, integrity_state AS integrityState, last_validated_at AS lastValidatedAt,
				 origin_json AS originJson, signature, signer_key_id AS signerKeyId, stale_after AS staleAfter, updated_at AS updatedAt
				 FROM tool_scratch_memory`
			)
			.all() as ScratchMemoryRecord[]
		for (const row of scratchRows) {
			const validated = validateScratchMemoryRecord(trustedSigners, row, nowIso)
			findings.push(...validated.findings)
			database
				.prepare(
					`UPDATE tool_scratch_memory
					 SET integrity_state = ?, last_validated_at = ?
					 WHERE id = ?`
				)
				.run(validated.state, nowIso, row.id)
		}

		return findings
	} finally {
		connection.client.close()
	}
}

export function readTrustedStructuredMemoryRecords(
	paths: AppPaths,
	memoryKind: Extract<ToolMemoryKind, 'episodic' | 'long-term'>
): Array<{ content: string; createdAt: string; id: string; tagsJson: string; title: string }> {
	refreshMemoryIntegrity(paths)
	const connection = openAppDatabaseConnection(paths.databaseFile)
	const database = connection.client

	try {
		return database
			.prepare(
				`SELECT content, created_at AS createdAt, id, tags_json AS tagsJson, title
				 FROM tool_memory_entries
				 WHERE kind = ? AND integrity_state = 'valid'
				 ORDER BY created_at DESC`
			)
			.all(memoryKind) as Array<{ content: string; createdAt: string; id: string; tagsJson: string; title: string }>
	} finally {
		connection.client.close()
	}
}

export function readTrustedScratchMemoryRecord(paths: AppPaths): { content: string } | null {
	refreshMemoryIntegrity(paths)
	const connection = openAppDatabaseConnection(paths.databaseFile)
	const database = connection.client

	try {
		return (
			(database.prepare(`SELECT content FROM tool_scratch_memory WHERE id = 1 AND integrity_state = 'valid'`).get() as {
				content: string
			} | null) ?? null
		)
	} finally {
		connection.client.close()
	}
}

function validateStructuredMemoryRecord(
	trustedSigners: ReturnType<typeof loadTrustedSigners>,
	row: StructuredMemoryRecord,
	nowIso: string
): ValidatedMemoryState {
	const origin = parseMemoryOrigin(row.originJson)
	if (!origin) {
		return buildInvalidMemoryState('invalid', `Memory entry "${row.id}" is missing valid origin metadata.`)
	}

	const tags = parseStringArray(row.tagsJson)
	if (!row.signerKeyId.trim() || !row.signature.trim()) {
		return buildInvalidMemoryState('unsigned', `Memory entry "${row.id}" is unsigned and ignored.`)
	}

	const verification = verifyPayloadSignature(
		trustedSigners,
		row.signerKeyId,
		buildStructuredMemoryPayload({
			content: row.content,
			createdAt: row.createdAt,
			id: row.id,
			kind: normalizeStructuredMemoryKind(row.kind),
			origin,
			tags,
			title: row.title
		}),
		row.signature
	)
	if (!verification.ok) {
		return buildInvalidMemoryState(
			verification.error.includes('not trusted') ? 'untrusted-signer' : 'tampered',
			`Memory entry "${row.id}" failed verification: ${verification.error}`
		)
	}

	if (isTimestampExpired(row.staleAfter, nowIso)) {
		return buildInvalidMemoryState('stale', `Memory entry "${row.id}" is stale and requires refresh.`)
	}

	return { findings: [], state: 'valid', trusted: true }
}

function validateScratchMemoryRecord(
	trustedSigners: ReturnType<typeof loadTrustedSigners>,
	row: ScratchMemoryRecord,
	nowIso: string
): ValidatedMemoryState {
	const origin = parseMemoryOrigin(row.originJson)
	if (!origin) {
		return buildInvalidMemoryState('invalid', 'Scratch memory is missing valid origin metadata.')
	}

	if (!row.signerKeyId.trim() || !row.signature.trim()) {
		return buildInvalidMemoryState('unsigned', 'Scratch memory is unsigned and ignored.')
	}

	const verification = verifyPayloadSignature(
		trustedSigners,
		row.signerKeyId,
		buildScratchMemoryPayload({
			content: row.content,
			createdAt: row.createdAt,
			id: row.id,
			origin,
			updatedAt: row.updatedAt
		}),
		row.signature
	)
	if (!verification.ok) {
		return buildInvalidMemoryState(
			verification.error.includes('not trusted') ? 'untrusted-signer' : 'tampered',
			`Scratch memory failed verification: ${verification.error}`
		)
	}

	if (isTimestampExpired(row.staleAfter, nowIso)) {
		return buildInvalidMemoryState('stale', 'Scratch memory is stale and requires refresh.')
	}

	return { findings: [], state: 'valid', trusted: true }
}

function buildInvalidMemoryState(state: Exclude<MemoryIntegrityState, 'valid'>, message: string): ValidatedMemoryState {
	return { findings: [{ blockingCapabilities: ['memory'], message, scope: 'memory' }], state, trusted: false }
}

function buildStructuredMemoryPayload(input: StructuredMemorySignatureInput): Record<string, unknown> {
	return {
		content: input.content,
		createdAt: input.createdAt,
		id: input.id,
		kind: input.kind,
		origin: input.origin,
		tags: input.tags,
		title: input.title
	}
}

function buildScratchMemoryPayload(input: ScratchMemorySignatureInput): Record<string, unknown> {
	return {
		content: input.content,
		createdAt: input.createdAt,
		id: input.id,
		origin: input.origin,
		updatedAt: input.updatedAt
	}
}

function parseStringArray(value: string): string[] {
	try {
		const parsed = JSON.parse(value) as unknown
		return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : []
	} catch {
		return []
	}
}

function parseMemoryOrigin(value: string): MemoryOrigin | null {
	try {
		const parsed = JSON.parse(value) as unknown
		if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
			return null
		}

		const record = parsed as Record<string, unknown>

		return {
			conversationId: typeof record.conversationId === 'string' ? record.conversationId : '',
			model: typeof record.model === 'string' ? record.model : '',
			provider: typeof record.provider === 'string' ? record.provider : '',
			toolName: typeof record.toolName === 'string' ? record.toolName : '',
			turnId: typeof record.turnId === 'string' ? record.turnId : ''
		}
	} catch {
		return null
	}
}

function normalizeStructuredMemoryKind(kind: string): Extract<ToolMemoryKind, 'episodic' | 'long-term'> {
	return kind === 'long-term' ? 'long-term' : 'episodic'
}
