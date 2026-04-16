import type { WorkerTranscriptEntry, WorkerTranscriptKind } from '../../types'
import type { WorkerTurnRequest } from './types'

type WorkerTranscriptState = {
	conversationId: string
	nextSequence: number
	onTranscriptEntry?: (entry: Omit<WorkerTranscriptEntry, 'id'>) => void
	turnId: string
}

export function createWorkerTranscriptState(
	input: WorkerTurnRequest,
	onTranscriptEntry?: (entry: Omit<WorkerTranscriptEntry, 'id'>) => void
): WorkerTranscriptState {
	return { conversationId: input.conversation.id, nextSequence: 0, onTranscriptEntry, turnId: input.turnId }
}

export function recordWorkerTranscriptEntry(
	state: WorkerTranscriptState,
	direction: WorkerTranscriptEntry['direction'],
	kind: WorkerTranscriptKind,
	payloadJson: string
): void {
	state.onTranscriptEntry?.({
		conversationId: state.conversationId,
		createdAt: new Date().toISOString(),
		direction,
		kind,
		payloadJson,
		sequence: state.nextSequence++,
		turnId: state.turnId
	})
}

export type { WorkerTranscriptState }
