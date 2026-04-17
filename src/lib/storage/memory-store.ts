import { readTrustedScratchMemoryRecord, readTrustedStructuredMemoryRecords } from '../integrity/memory'
import { loadIntegrityStatus } from '../integrity/state'
import type { AppPaths } from '../paths'

export type MemoryKind = 'episodic' | 'long-term' | 'scratch'
export type StoredMemoryEntry = { content: string; createdAt: string; id: string; tags: string[]; title: string }
export type MemorySnapshot = { episodic: StoredMemoryEntry[]; longTerm: StoredMemoryEntry[]; scratch: string }

export function loadMemorySnapshot(paths: AppPaths): MemorySnapshot {
	const integrityStatus = loadIntegrityStatus(paths)
	if (integrityStatus.killSwitchActive) {
		return { episodic: [], longTerm: [], scratch: '' }
	}

	return {
		episodic: readStructuredMemoryEntries(paths, 'episodic'),
		longTerm: readStructuredMemoryEntries(paths, 'long-term'),
		scratch: readTrustedScratchMemoryRecord(paths)?.content ?? ''
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

function readStructuredMemoryEntries(
	paths: AppPaths,
	memory: Extract<MemoryKind, 'episodic' | 'long-term'>
): StoredMemoryEntry[] {
	const rows = readTrustedStructuredMemoryRecords(paths, memory)

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
