import type { ResolvedAppConfig } from '../../config'
import type { ToolAuthorizationContext } from '../../tools/policy'
import type { ToolMutationRecord } from '../../tools/tool-types'
import type { ConversationRecord, InferenceToolCall, MessageRecord } from '../../types'

export type WorkerHostMounts = { agentRoot: string; configRoot: string }
export type WorkerFilesystemRoots = { defaultReadRoot: string; readRoots: string[]; writeRoots: string[] }
export type WorkerHostedToolName = 'question' | 'remember' | 'skill' | 'todo'

export type WorkerTurnRequest = {
	config: ResolvedAppConfig
	conversation: ConversationRecord
	hostMounts: WorkerHostMounts
	messages: MessageRecord[]
	turnId: string
}

export type WorkerTurnInput = Omit<WorkerTurnRequest, 'hostMounts'> & { filesystem: WorkerFilesystemRoots }

export type WorkerTurnCompletedEvent = { content: string; model: string; provider: string; type: 'completed' }

export type WorkerTurnEvent =
	| { delta: string; type: 'textDelta' }
	| { toolCalls: InferenceToolCall[]; type: 'toolCallsFinish' }
	| { toolCalls: InferenceToolCall[]; type: 'toolCallsStart' }
	| { mutation: ToolMutationRecord; type: 'mutation' }
	| WorkerTurnCompletedEvent

export type WorkerHostToolRequest = {
	argumentsJson: string
	requestId: string
	toolName: WorkerHostedToolName
	type: 'hostToolRequest'
}

export type WorkerHostToolResponse =
	| { requestId: string; result: string; type: 'hostToolResponse' }
	| { error: string; requestId: string; type: 'hostToolError' }

export type WorkerToolAuthorizationRequest = {
	argumentsJson: string
	requestId: string
	toolName: string
	type: 'toolAuthorizationRequest'
}

export type WorkerToolAuthorizationResponse =
	| { context: ToolAuthorizationContext; requestId: string; type: 'toolAuthorizationAllow' }
	| { error: string; requestId: string; type: 'toolAuthorizationDeny' }

export type WorkerStdoutMessage =
	| { event: WorkerTurnEvent; type: 'event' }
	| WorkerHostToolRequest
	| WorkerToolAuthorizationRequest
