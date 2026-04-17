import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'

import { toolMemoryEntries, toolScratchMemory } from '../../db/schema'
import {
	buildMemoryOrigin,
	readTrustedScratchMemoryRecord,
	readTrustedStructuredMemoryRecords,
	signScratchMemoryRecord,
	signStructuredMemoryRecord
} from '../integrity/memory'
import { loadIntegrityStatus } from '../integrity/state'
import { getErrorMessage, isRecord, parseOptionalPositiveInteger } from './common'
import { withToolDatabase } from './database'
import type { ToolExecutionContext, ToolMemoryKind } from './tool-types'
import { parseOptionalStringField } from './value-parsers'

const DEFAULT_MEMORY_LIMIT = 10

export const REMEMBER_TOOL_NAME = 'remember'

export const REMEMBER_TOOL_DEFINITION = {
	function: {
		description: 'Store and retrieve scratch, episodic, or long-term memory entries.',
		name: REMEMBER_TOOL_NAME,
		parameters: {
			additionalProperties: false,
			properties: {
				action: { description: 'Memory action: read, write, or list.', type: 'string' },
				content: { description: 'Memory content to write.', type: 'string' },
				limit: { description: 'Maximum number of memory entries to return.', minimum: 1, type: 'integer' },
				memory: { description: 'Memory type: scratch, episodic, or long-term.', type: 'string' },
				mode: { description: 'Scratch write mode: append or replace.', type: 'string' },
				query: { description: 'Optional text filter for episodic or long-term memories.', type: 'string' },
				tags: {
					description: 'Optional tags for episodic or long-term memories.',
					items: { type: 'string' },
					type: 'array'
				},
				title: { description: 'Optional title for episodic or long-term memories.', type: 'string' }
			},
			required: ['action', 'memory'],
			type: 'object'
		},
		strict: true
	},
	type: 'function'
} as const

type MemoryAction = 'list' | 'read' | 'write'
type ScratchMode = 'append' | 'replace'
type MemoryEntry = { content: string; createdAt: string; id: string; tags: string[]; title: string }
type MemoryDatabaseRow = { content: string; createdAt: string; id: string; tagsJson: string; title: string }
type RememberArguments = {
	action: MemoryAction
	content?: string
	limit?: number
	memory: ToolMemoryKind
	mode?: ScratchMode
	query?: string
	tags?: string[]
	title?: string
}
type RememberErrorResult = { error: string; ok: false }
type RememberSuccessResult =
	| { content: string; memory: ToolMemoryKind; ok: true }
	| { entries: MemoryEntry[]; memory: ToolMemoryKind; ok: true; total: number; truncated: boolean }
	| { entry: MemoryEntry; memory: ToolMemoryKind; ok: true }
type DatabaseLike = Parameters<Parameters<typeof withToolDatabase>[1]>[0]

export type RememberResult = RememberErrorResult | RememberSuccessResult

export function executeRememberTool(argumentsJson: string, options: ToolExecutionContext = {}): string {
	try {
		const parsedArguments = JSON.parse(argumentsJson) as unknown
		return JSON.stringify(runRememberTool(parsedArguments, options))
	} catch (error) {
		return JSON.stringify({
			error: `Invalid remember arguments: ${getErrorMessage(error)}`,
			ok: false
		} satisfies RememberErrorResult)
	}
}

export function runRememberTool(input: unknown, options: ToolExecutionContext = {}): RememberResult {
	try {
		const argumentsValue = parseRememberArguments(input)
		assertMemoryKindAllowed(argumentsValue.memory, options)
		assertRememberToolEnabled(options)

		return withToolDatabase(options, database => {
			if (argumentsValue.memory === 'scratch') {
				return runScratchMemory(database, argumentsValue, options)
			}

			return runStructuredMemory(database, argumentsValue, options)
		})
	} catch (error) {
		return { error: getErrorMessage(error), ok: false }
	}
}

function assertMemoryKindAllowed(memoryKind: ToolMemoryKind, options: ToolExecutionContext): void {
	const allowedMemoryKinds = options.allowedMemoryKinds
	if (allowedMemoryKinds && !allowedMemoryKinds.includes(memoryKind)) {
		throw new Error(`Memory kind "${memoryKind}" is denied by policy for tool "remember".`)
	}
}

function runScratchMemory(
	database: DatabaseLike,
	argumentsValue: RememberArguments,
	options: ToolExecutionContext
): RememberSuccessResult {
	switch (argumentsValue.action) {
		case 'read':
		case 'list':
			return {
				content: readTrustedScratchMemoryRecord(getRequiredAppPaths(options))?.content ?? '',
				memory: 'scratch',
				ok: true
			}
		case 'write': {
			const currentContent = getScratchContent(database)
			const nextContent = buildScratchContent(currentContent, argumentsValue.content, argumentsValue.mode ?? 'append')
			const now = new Date().toISOString()
			const createdAt = getScratchCreatedAt(database) ?? now
			const signature = signScratchMemoryRecord(getRequiredAppPaths(options), {
				content: nextContent,
				createdAt,
				id: 1,
				origin: buildMemoryOrigin(options.memoryOrigin, REMEMBER_TOOL_NAME),
				updatedAt: now
			})
			database
				.insert(toolScratchMemory)
				.values({
					content: nextContent,
					createdAt,
					id: 1,
					integrityState: signature.integrityState,
					lastValidatedAt: signature.lastValidatedAt,
					originJson: signature.originJson,
					signature: signature.signature,
					signerKeyId: signature.signerKeyId,
					staleAfter: signature.staleAfter,
					updatedAt: now
				})
				.onConflictDoUpdate({
					set: {
						content: nextContent,
						createdAt,
						integrityState: signature.integrityState,
						lastValidatedAt: signature.lastValidatedAt,
						originJson: signature.originJson,
						signature: signature.signature,
						signerKeyId: signature.signerKeyId,
						staleAfter: signature.staleAfter,
						updatedAt: now
					},
					target: toolScratchMemory.id
				})
				.run()
			return { content: nextContent, memory: 'scratch', ok: true }
		}
	}
}

function runStructuredMemory(
	database: DatabaseLike,
	argumentsValue: RememberArguments,
	options: ToolExecutionContext
): RememberSuccessResult {
	const memory = argumentsValue.memory === 'episodic' ? 'episodic' : 'long-term'

	switch (argumentsValue.action) {
		case 'write':
			return writeStructuredMemory(database, memory, argumentsValue, options)
		case 'read':
		case 'list':
			return listStructuredMemory(memory, argumentsValue, options)
	}
}

function getScratchContent(database: DatabaseLike): string {
	const row = database
		.select({ content: toolScratchMemory.content })
		.from(toolScratchMemory)
		.where(eq(toolScratchMemory.id, 1))
		.get()
	return row?.content ?? ''
}

function getScratchCreatedAt(database: DatabaseLike): string | null {
	const row = database
		.select({ createdAt: toolScratchMemory.createdAt })
		.from(toolScratchMemory)
		.where(eq(toolScratchMemory.id, 1))
		.get()
	return row?.createdAt || null
}

function toMemoryEntry(row: MemoryDatabaseRow): MemoryEntry {
	return { content: row.content, createdAt: row.createdAt, id: row.id, tags: parseTags(row.tagsJson), title: row.title }
}

function parseTags(tagsJson: string): string[] {
	try {
		const parsed = JSON.parse(tagsJson) as unknown
		return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []
	} catch {
		return []
	}
}

function parseRememberArguments(input: unknown): RememberArguments {
	if (!isRecord(input)) {
		throw new Error('Arguments must be a JSON object.')
	}

	const action = input.action
	if (action !== 'list' && action !== 'read' && action !== 'write') {
		throw new Error('action must be one of: read, write, list.')
	}

	const memory = input.memory
	if (memory !== 'scratch' && memory !== 'episodic' && memory !== 'long-term') {
		throw new Error('memory must be one of: scratch, episodic, long-term.')
	}

	const mode = input.mode
	if (mode !== undefined && mode !== 'append' && mode !== 'replace') {
		throw new Error('mode must be append or replace when provided.')
	}

	const tags = input.tags
	if (tags !== undefined && (!Array.isArray(tags) || tags.some(tag => typeof tag !== 'string'))) {
		throw new Error('tags must be an array of strings when provided.')
	}

	return {
		action,
		content: parseOptionalStringField(input.content, 'content'),
		limit: parseOptionalPositiveInteger(input.limit, 'limit'),
		memory,
		mode,
		query: parseOptionalStringField(input.query, 'query'),
		tags,
		title: parseOptionalStringField(input.title, 'title')
	}
}

function buildScratchContent(currentContent: string, nextChunk: string | undefined, mode: ScratchMode): string {
	const content = nextChunk ?? ''
	if (mode === 'replace') {
		return content
	}

	if (!currentContent) {
		return content
	}

	if (!content) {
		return currentContent
	}

	return currentContent.endsWith('\n') || content.startsWith('\n')
		? `${currentContent}${content}`
		: `${currentContent}\n${content}`
}

function writeStructuredMemory(
	database: DatabaseLike,
	memory: Extract<ToolMemoryKind, 'episodic' | 'long-term'>,
	argumentsValue: RememberArguments,
	options: ToolExecutionContext
): RememberSuccessResult {
	const content = argumentsValue.content?.trim()
	if (!content) {
		throw new Error('content is required for action "write".')
	}

	const entry: MemoryEntry = {
		content,
		createdAt: new Date().toISOString(),
		id: randomUUID(),
		tags: argumentsValue.tags ?? [],
		title: argumentsValue.title?.trim() ?? ''
	}
	const signature = signStructuredMemoryRecord(getRequiredAppPaths(options), {
		content: entry.content,
		createdAt: entry.createdAt,
		id: entry.id,
		kind: memory,
		origin: buildMemoryOrigin(options.memoryOrigin, REMEMBER_TOOL_NAME),
		tags: entry.tags,
		title: entry.title
	})
	database
		.insert(toolMemoryEntries)
		.values({
			content: entry.content,
			createdAt: entry.createdAt,
			id: entry.id,
			integrityState: signature.integrityState,
			kind: memory,
			lastValidatedAt: signature.lastValidatedAt,
			originJson: signature.originJson,
			signature: signature.signature,
			signerKeyId: signature.signerKeyId,
			staleAfter: signature.staleAfter,
			tagsJson: JSON.stringify(entry.tags),
			title: entry.title
		})
		.run()

	return { entry, memory, ok: true }
}

function listStructuredMemory(
	memory: Extract<ToolMemoryKind, 'episodic' | 'long-term'>,
	argumentsValue: RememberArguments,
	options: ToolExecutionContext
): RememberSuccessResult {
	const filteredEntries = readStructuredMemoryEntries(getRequiredAppPaths(options), memory, argumentsValue.query)
	const limit = argumentsValue.limit ?? DEFAULT_MEMORY_LIMIT

	return {
		entries: filteredEntries.slice(0, limit),
		memory,
		ok: true,
		total: filteredEntries.length,
		truncated: filteredEntries.length > limit
	}
}

function readStructuredMemoryEntries(
	appPaths: ReturnType<typeof getRequiredAppPaths>,
	memory: Extract<ToolMemoryKind, 'episodic' | 'long-term'>,
	query: string | undefined
): MemoryEntry[] {
	const normalizedQuery = query?.trim().toLowerCase()
	const rows = readTrustedStructuredMemoryRecords(appPaths, memory) as MemoryDatabaseRow[]

	return rows
		.map(row => toMemoryEntry(row))
		.filter(entry => {
			if (!normalizedQuery) {
				return true
			}

			return `${entry.title}\n${entry.content}\n${entry.tags.join(' ')}`.toLowerCase().includes(normalizedQuery)
		})
}

function assertRememberToolEnabled(options: ToolExecutionContext): void {
	const integrityStatus = loadIntegrityStatus(getRequiredAppPaths(options))
	if (integrityStatus.killSwitchActive) {
		throw new Error('Remember is blocked while the deny kill switch is active.')
	}
}

function getRequiredAppPaths(options: ToolExecutionContext) {
	if (!options.appPaths) {
		throw new Error('Remember requires app storage paths.')
	}

	return options.appPaths
}
