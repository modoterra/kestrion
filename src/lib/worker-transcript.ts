import type { WorkerTranscriptEntry } from './types'

export function mergeWorkerTranscriptEntries(
	current: WorkerTranscriptEntry[],
	next: WorkerTranscriptEntry[]
): WorkerTranscriptEntry[] {
	const merged = new Map<string, WorkerTranscriptEntry>()

	for (const entry of current) {
		merged.set(entry.id, entry)
	}

	for (const entry of next) {
		merged.set(entry.id, entry)
	}

	return [...merged.values()].toSorted(compareWorkerTranscriptEntries)
}

export function compareWorkerTranscriptEntries(left: WorkerTranscriptEntry, right: WorkerTranscriptEntry): number {
	const createdAtComparison = left.createdAt.localeCompare(right.createdAt)
	if (createdAtComparison !== 0) {
		return createdAtComparison
	}

	const sequenceComparison = left.sequence - right.sequence
	if (sequenceComparison !== 0) {
		return sequenceComparison
	}

	return left.id.localeCompare(right.id)
}
