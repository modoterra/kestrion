export type MessageRole = 'system' | 'user' | 'assistant'

export type InferenceToolCall = { argumentsJson: string; id: string; name: string }
export type ToolApprovalDecisionMode = 'allowForever' | 'allowOnce' | 'allowSession' | 'deny' | 'denyForever' | 'other'
export type ToolApprovalPrompt = {
	approvalId: string
	description: string
	requestedAccess: string
	toolArgumentsJson: string
	toolName: string
}
export type ToolApprovalResponse = { explanation?: string; mode: ToolApprovalDecisionMode }
export type WorkerTranscriptDirection = 'daemonToWorker' | 'workerToDaemon'
export type WorkerTranscriptKind =
	| 'executionError'
	| 'executionEvent'
	| 'executeToolRequest'
	| 'executeToolResponse'
	| 'toolAuthorizationAllow'
	| 'toolAuthorizationDeny'
	| 'toolAuthorizationRequest'
	| 'hostToolError'
	| 'hostToolRequest'
	| 'hostToolResponse'
	| 'sessionBootstrap'
	| 'shutdown'
	| 'turnInput'
	| 'workerEvent'
export type ToolCallMessageRecord = {
	conversationId: string
	createdAt: string
	id: string
	status: 'completed' | 'running'
	toolCalls: InferenceToolCall[]
}
export type WorkerTranscriptEntry = {
	conversationId: string
	createdAt: string
	direction: WorkerTranscriptDirection
	id: string
	kind: WorkerTranscriptKind
	payloadJson: string
	sequence: number
	turnId: string
}

export type ConversationRecord = {
	createdAt: string
	id: string
	model: string
	provider: string
	title: string
	updatedAt: string
}

export type ConversationSummary = ConversationRecord & { messageCount: number; preview: string | null }

export type ConversationCompactionRecord = {
	compactedThroughMessageId: string
	conversationId: string
	summary: string
	updatedAt: string
}

export type ConversationCompactionResult = {
	compacted: boolean
	conversationId: string
	reason: 'draft' | 'no-op' | 'updated'
}

export type MessageRecord = {
	content: string
	conversationId: string
	createdAt: string
	id: string
	model: string | null
	provider: string | null
	role: MessageRole
}

export type ConversationThread = {
	compaction: ConversationCompactionRecord | null
	conversation: ConversationRecord
	messages: MessageRecord[]
	toolCallMessages: ToolCallMessageRecord[]
}

export type InferenceMessage = { content: string; role: MessageRole }

export type InferenceEvents = {
	onTextDelta?: (delta: string) => void
	onToolApprovalPrompt?: (prompt: ToolApprovalPrompt) => Promise<ToolApprovalResponse> | ToolApprovalResponse
	onToolCallsFinish?: (toolCalls: InferenceToolCall[]) => void
	onToolCallsStart?: (toolCalls: InferenceToolCall[]) => void
	onWorkerTranscriptEntry?: (entry: WorkerTranscriptEntry) => void
}

export type InferenceRequest = {
	events?: InferenceEvents
	maxTokens: number
	messages: InferenceMessage[]
	model: string
	promptTruncateLength: number
	reasoningEffort?: string
	signal?: AbortSignal
	temperature: number
	toolMode?: 'disabled' | 'enabled'
	topP?: number
}

export type InferenceResult = { content: string; id?: string; model: string; provider: string; raw?: unknown }

export type ProviderCatalogRecord = { description: string; id: string; label: string; sortOrder: number }

export type ProviderModelRecord = {
	description: string
	id: string
	label: string
	model: string
	providerId: string
	sortOrder: number
}
