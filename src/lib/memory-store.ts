import { desc, eq } from 'drizzle-orm'

import { toolMemoryEntries, toolScratchMemory } from '../db/schema'
import { openAppDatabaseConnectionWithDrizzle } from './app-database'
import type { AppPaths } from './paths'

export type MemoryKind = 'episodic' | 'long-term' | 'scratch'
export type StoredMemoryEntry = { content: string; createdAt: string; id: string; tags: string[]; title: string }
export type MemorySnapshot = { episodic: StoredMemoryEntry[]; longTerm: StoredMemoryEntry[]; scratch: string }

type MemoryDatabaseRow = { content: string; createdAt: string; id: string; tagsJson: string; title: string }
type DatabaseLike = ReturnType<typeof openAppDatabaseConnectionWithDrizzle>['db']

export function loadMemorySnapshot(paths: AppPaths): MemorySnapshot {
	const connection = openAppDatabaseConnectionWithDrizzle(paths.databaseFile)

	try {
		return {
			episodic: readStructuredMemoryEntries(connection.db, 'episodic'),
			longTerm: readStructuredMemoryEntries(connection.db, 'long-term'),
			scratch: getScratchContent(connection.db)
		}
	} finally {
		connection.client.close()
	}
}

export function getMemoryLabel(kind: MemoryKind): string {
	switch (kind) {
		case 'scratch':
			return 'Scratch'
		case 'episodic':
			return 'Episodic'
		case 'long-term':
			return 'Long-term'
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

function readStructuredMemoryEntries(
	database: DatabaseLike,
	memory: Extract<MemoryKind, 'episodic' | 'long-term'>
): StoredMemoryEntry[] {
	const rows = database
		.select({
			content: toolMemoryEntries.content,
			createdAt: toolMemoryEntries.createdAt,
			id: toolMemoryEntries.id,
			tagsJson: toolMemoryEntries.tagsJson,
			title: toolMemoryEntries.title
		})
		.from(toolMemoryEntries)
		.where(eq(toolMemoryEntries.kind, memory))
		.orderBy(desc(toolMemoryEntries.createdAt))
		.all() as MemoryDatabaseRow[]

	return rows.map(row => ({
		content: row.content,
		createdAt: row.createdAt,
		id: row.id,
		tags: parseTags(row.tagsJson),
		title: row.title
	}))
}

function parseTags(tagsJson: string): string[] {
	try {
		const parsed = JSON.parse(tagsJson) as unknown
		return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []
	} catch {
		return []
	}
}
