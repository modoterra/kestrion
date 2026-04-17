import type { WorkerTranscriptEntry } from '../../types'
import type {
	WorkerExecutionEvent,
	WorkerSessionRequest,
	WorkerToolExecutionRequest,
	WorkerToolExecutionResponse
} from './types'

export interface WorkerSession {
	close(): Promise<void>
	executeTool(request: WorkerToolExecutionRequest): Promise<WorkerToolExecutionResponse>
}

export interface TurnRunner {
	startSession(
		input: WorkerSessionRequest,
		signal?: AbortSignal,
		onTranscriptEntry?: (entry: Omit<WorkerTranscriptEntry, 'id'>) => void,
		onExecutionEvent?: (event: WorkerExecutionEvent) => void
	): Promise<WorkerSession>
}
