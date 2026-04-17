import { Buffer } from 'node:buffer'

import type { ToolInvocationAuditRecord } from './tool-types'

const REDACTED_ARGUMENT_KEYS = new Set(['content', 'newText', 'oldText', 'patch', 'text'])
const MAX_ARRAY_ITEMS = 12
const MAX_OBJECT_KEYS = 16
const MAX_STRING_LENGTH = 160

export function createDeniedToolAuditRecord(
	toolName: string,
	argumentsJson: string,
	error: string
): ToolInvocationAuditRecord {
	return { durationMs: 0, error, sanitizedArguments: sanitizeToolArguments(argumentsJson), status: 'denied', toolName }
}

export function createErroredToolAuditRecord(
	toolName: string,
	argumentsJson: string,
	error: string,
	durationMs: number
): ToolInvocationAuditRecord {
	return { durationMs, error, sanitizedArguments: sanitizeToolArguments(argumentsJson), status: 'error', toolName }
}

export function createToolInvocationAuditRecord(
	toolName: string,
	argumentsJson: string,
	result: string,
	durationMs: number
): ToolInvocationAuditRecord {
	const parsedResult = parseJson(result)
	const status = resolveStatus(parsedResult)
	const record: ToolInvocationAuditRecord = {
		durationMs,
		outputSizeBytes: Buffer.byteLength(result, 'utf8'),
		sanitizedArguments: sanitizeToolArguments(argumentsJson),
		status,
		toolName
	}

	if (isRecord(parsedResult) && typeof parsedResult.error === 'string' && parsedResult.error.trim()) {
		record.error = parsedResult.error.trim()
	}

	if (toolName === 'bash') {
		applyBashAuditDetails(record, parsedResult)
	} else if (toolName === 'fetch') {
		applyFetchAuditDetails(record, parsedResult)
	}

	return record
}

export function sanitizeToolArguments(argumentsJson: string): unknown {
	return sanitizeValue(parseJson(argumentsJson))
}

function applyBashAuditDetails(record: ToolInvocationAuditRecord, parsedResult: unknown): void {
	if (!isRecord(parsedResult)) {
		return
	}

	if (typeof parsedResult.exitCode === 'number') {
		record.exitCode = parsedResult.exitCode
	}
	if (parsedResult.timedOut === true) {
		record.timedOut = true
	}

	const stdout = typeof parsedResult.stdout === 'string' ? parsedResult.stdout : ''
	const stderr = typeof parsedResult.stderr === 'string' ? parsedResult.stderr : ''
	record.responseSizeBytes = Buffer.byteLength(stdout, 'utf8') + Buffer.byteLength(stderr, 'utf8')
}

function applyFetchAuditDetails(record: ToolInvocationAuditRecord, parsedResult: unknown): void {
	if (!isRecord(parsedResult)) {
		return
	}

	if (typeof parsedResult.status === 'number') {
		record.responseStatus = parsedResult.status
	}
	if (typeof parsedResult.url === 'string' && parsedResult.url) {
		record.finalUrl = parsedResult.url
	}
	if (typeof parsedResult.contentType === 'string' && parsedResult.contentType) {
		record.contentType = parsedResult.contentType
	}
	if (typeof parsedResult.sizeBytes === 'number') {
		record.responseSizeBytes = parsedResult.sizeBytes
	}
}

function resolveStatus(parsedResult: unknown): ToolInvocationAuditRecord['status'] {
	if (isRecord(parsedResult) && parsedResult.ok === false) {
		return 'error'
	}

	return 'success'
}

function parseJson(value: string): unknown {
	try {
		return JSON.parse(value) as unknown
	} catch {
		return value
	}
}

function sanitizeValue(value: unknown, key?: string): unknown {
	if (typeof value === 'string') {
		if (key && REDACTED_ARGUMENT_KEYS.has(key)) {
			return `[omitted ${value.length} chars]`
		}

		return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH - 3)}...` : value
	}

	if (typeof value === 'number' || typeof value === 'boolean' || value === null || value === undefined) {
		return value
	}

	if (Array.isArray(value)) {
		const items = value.slice(0, MAX_ARRAY_ITEMS).map(entry => sanitizeValue(entry))
		if (value.length > MAX_ARRAY_ITEMS) {
			items.push(`[+${value.length - MAX_ARRAY_ITEMS} more items]`)
		}
		return items
	}

	if (!isRecord(value)) {
		return String(value)
	}

	const sanitized: Record<string, unknown> = {}
	const entries = Object.entries(value).slice(0, MAX_OBJECT_KEYS)
	for (const [entryKey, entryValue] of entries) {
		sanitized[entryKey] = sanitizeValue(entryValue, entryKey)
	}
	if (Object.keys(value).length > MAX_OBJECT_KEYS) {
		sanitized.__truncated__ = `[+${Object.keys(value).length - MAX_OBJECT_KEYS} more keys]`
	}
	return sanitized
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}
