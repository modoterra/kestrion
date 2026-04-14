import type { Database } from 'bun:sqlite'
import { randomUUID } from 'node:crypto'

import { getErrorMessage, isRecord, parseOptionalPositiveInteger } from './common'
import { withToolDatabase } from './database'
import type { ToolExecutionContext } from './tool-types'
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
type MemoryKind = 'episodic' | 'long-term' | 'scratch'
type ScratchMode = 'append' | 'replace'
type MemoryEntry = { content: string; createdAt: string; id: string; tags: string[]; title: string }
type MemoryDatabaseRow = { content: string; createdAt: string; id: string; tagsJson: string; title: string }
type RememberArguments = {
	action: MemoryAction
	content?: string
	limit?: number
	memory: MemoryKind
	mode?: ScratchMode
	query?: string
	tags?: string[]
	title?: string
}
type RememberErrorResult = { error: string; ok: false }
type RememberSuccessResult =
	| { content: string; memory: MemoryKind; ok: true }
	| { entries: MemoryEntry[]; memory: MemoryKind; ok: true; total: number; truncated: boolean }
	| { entry: MemoryEntry; memory: MemoryKind; ok: true }

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

		return withToolDatabase(options, database => {
			if (argumentsValue.memory === 'scratch') {
				return runScratchMemory(database, argumentsValue)
			}

			return runStructuredMemory(database, argumentsValue)
		})
	} catch (error) {
		return { error: getErrorMessage(error), ok: false }
	}
}

function runScratchMemory(database: Database, argumentsValue: RememberArguments): RememberSuccessResult {
	const currentContent = getScratchContent(database)

	switch (argumentsValue.action) {
		case 'read':
		case 'list':
			return { content: currentContent, memory: 'scratch', ok: true }
		case 'write': {
			const nextContent = buildScratchContent(currentContent, argumentsValue.content, argumentsValue.mode ?? 'append')
			const now = new Date().toISOString()
			database
				.prepare(
					`INSERT INTO tool_scratch_memory (id, content, updated_at)
					VALUES (1, ?, ?)
					ON CONFLICT(id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`
				)
				.run(nextContent, now)
			return { content: nextContent, memory: 'scratch', ok: true }
		}
	}
}

function runStructuredMemory(database: Database, argumentsValue: RememberArguments): RememberSuccessResult {
	const memory = argumentsValue.memory === 'episodic' ? 'episodic' : 'long-term'

	switch (argumentsValue.action) {
		case 'write':
			return writeStructuredMemory(database, memory, argumentsValue)
		case 'read':
		case 'list':
			return listStructuredMemory(database, memory, argumentsValue)
	}
}

function getScratchContent(database: Database): string {
	const row = database.prepare('SELECT content FROM tool_scratch_memory WHERE id = 1').get() as {
		content: string
	} | null
	return row?.content ?? ''
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
	database: Database,
	memory: Extract<MemoryKind, 'episodic' | 'long-term'>,
	argumentsValue: RememberArguments
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
	database
		.prepare(
			`INSERT INTO tool_memory_entries (
				id,
				kind,
				title,
				content,
				tags_json,
				created_at
			) VALUES (?, ?, ?, ?, ?, ?)`
		)
		.run(entry.id, memory, entry.title, entry.content, JSON.stringify(entry.tags), entry.createdAt)

	return { entry, memory, ok: true }
}

function listStructuredMemory(
	database: Database,
	memory: Extract<MemoryKind, 'episodic' | 'long-term'>,
	argumentsValue: RememberArguments
): RememberSuccessResult {
	const filteredEntries = readStructuredMemoryEntries(database, memory, argumentsValue.query)
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
	database: Database,
	memory: Extract<MemoryKind, 'episodic' | 'long-term'>,
	query: string | undefined
): MemoryEntry[] {
	const normalizedQuery = query?.trim().toLowerCase()
	const rows = database
		.prepare(
			`SELECT
				id,
				title,
				content,
				tags_json AS tagsJson,
				created_at AS createdAt
			FROM tool_memory_entries
			WHERE kind = ?
			ORDER BY created_at DESC`
		)
		.all(memory) as MemoryDatabaseRow[]

	return rows
		.map(row => toMemoryEntry(row))
		.filter(entry => {
			if (!normalizedQuery) {
				return true
			}

			return `${entry.title}\n${entry.content}\n${entry.tags.join(' ')}`.toLowerCase().includes(normalizedQuery)
		})
}
