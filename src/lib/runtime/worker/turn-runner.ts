import type { WorkerTranscriptEntry } from '../../types'
import type {
	WorkerHostToolRequest,
	WorkerHostToolResponse,
	WorkerToolAuthorizationRequest,
	WorkerToolAuthorizationResponse,
	WorkerTurnCompletedEvent,
	WorkerTurnEvent,
	WorkerTurnRequest
} from './types'

export interface TurnRunner {
	runTurn(
		input: WorkerTurnRequest,
		onEvent: (event: WorkerTurnEvent) => void,
		signal?: AbortSignal,
		onToolAuthorizationRequest?: (request: WorkerToolAuthorizationRequest) => Promise<WorkerToolAuthorizationResponse>,
		onHostToolRequest?: (request: WorkerHostToolRequest) => Promise<WorkerHostToolResponse>,
		onTranscriptEntry?: (entry: Omit<WorkerTranscriptEntry, 'id'>) => void
	): Promise<WorkerTurnCompletedEvent>
}
