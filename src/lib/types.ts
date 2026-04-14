export type MessageRole = 'system' | 'user' | 'assistant'

export type InferenceToolCall = { argumentsJson: string; id: string; name: string }

export type ConversationRecord = {
	createdAt: string
	id: string
	model: string
	provider: string
	title: string
	updatedAt: string
}

export type ConversationSummary = ConversationRecord & { messageCount: number; preview: string | null }

export type MessageRecord = {
	content: string
	conversationId: string
	createdAt: string
	id: string
	model: string | null
	provider: string | null
	role: MessageRole
}

export type ConversationThread = { conversation: ConversationRecord; messages: MessageRecord[] }

export type InferenceMessage = { content: string; role: MessageRole }

export type InferenceEvents = {
	onTextDelta?: (delta: string) => void
	onToolCallsFinish?: (toolCalls: InferenceToolCall[]) => void
	onToolCallsStart?: (toolCalls: InferenceToolCall[]) => void
}

export type InferenceRequest = {
	events?: InferenceEvents
	maxTokens: number
	messages: InferenceMessage[]
	model: string
	promptTruncateLength: number
	signal?: AbortSignal
	temperature: number
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
