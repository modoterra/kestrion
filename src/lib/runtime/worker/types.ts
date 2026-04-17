import type { ResolvedAppConfig } from '../../config'
import type { ToolAuthorizationContext } from '../../tools/policy'
import type { ToolInvocationAuditRecord, ToolMutationRecord } from '../../tools/tool-types'
import type { ConversationRecord, InferenceToolCall, MessageRecord } from '../../types'

export type WorkerExecutionTelemetry = {
	durationMs?: number
	exitCode?: number
	outputSizeBytes?: number
	resourceUsage?: ToolInvocationAuditRecord['resourceUsage']
	timedOut?: boolean
}

export type WorkerHostMounts = { agentRoot: string; configRoot: string }
export type WorkerFilesystemRoots = { defaultReadRoot: string; readRoots: string[]; writeRoots: string[] }
export type WorkerHostedToolName = 'fetch' | 'question' | 'remember' | 'skill' | 'todo'

export type WorkerSessionRequest = { conversation: ConversationRecord; hostMounts: WorkerHostMounts; turnId: string }

export type WorkerSessionBootstrap = { conversationId: string; filesystem: WorkerFilesystemRoots; turnId: string }

export type WorkerTurnRequest = WorkerSessionRequest & { config: ResolvedAppConfig; messages: MessageRecord[] }

export type WorkerTurnInput = {
	config: ResolvedAppConfig
	conversation: ConversationRecord
	filesystem: WorkerFilesystemRoots
	messages: MessageRecord[]
	turnId: string
}

export type WorkerToolExecutionRequest = {
	argumentsJson: string
	authorization: ToolAuthorizationContext
	requestId: string
	toolName: string
}

export type WorkerToolExecutionResponse = {
	audits: ToolInvocationAuditRecord[]
	error?: string
	mutations: ToolMutationRecord[]
	ok: boolean
	requestId: string
	result?: string
	telemetry?: WorkerExecutionTelemetry
}

export type WorkerExecutionEvent =
	| { payload?: Record<string, unknown>; requestId: string; toolName: string; type: 'toolStarted' }
	| { payload?: Record<string, unknown>; requestId: string; toolName: string; type: 'toolCompleted' }

export type WorkerTurnCompletedEvent = { content: string; model: string; provider: string; type: 'completed' }

export type WorkerTurnEvent =
	| { delta: string; type: 'textDelta' }
	| { toolCalls: InferenceToolCall[]; type: 'toolCallsFinish' }
	| { toolCalls: InferenceToolCall[]; type: 'toolCallsStart' }
	| { audit: ToolInvocationAuditRecord; type: 'toolAudit' }
	| { mutation: ToolMutationRecord; type: 'mutation' }
	| WorkerTurnCompletedEvent
