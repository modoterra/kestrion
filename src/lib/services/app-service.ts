import type { ResolvedAppConfig } from '../config'
import type { MemorySnapshot } from '../storage/memory-store'
import type { ToolExecutionContext } from '../tools/tool-types'
import type {
	ConversationSummary,
	ConversationThread,
	InferenceEvents,
	ProviderModelRecord,
	WorkerTranscriptEntry
} from '../types'

export interface AppService {
	addUserMessage(conversationId: string, content: string): Promise<ConversationThread>
	createDraftConversation(): ConversationThread
	deleteAllConversations(): Promise<void>
	deleteConversation(conversationId: string): Promise<void>
	generateAssistantReply(
		conversationId: string,
		signal?: AbortSignal,
		events?: InferenceEvents,
		toolContext?: ToolExecutionContext
	): Promise<ConversationThread>
	getStartupThread(conversations?: ConversationSummary[]): Promise<ConversationThread>
	listConversations(limit?: number): Promise<ConversationSummary[]>
	listProviderModels(providerId: string): Promise<ProviderModelRecord[]>
	loadConversation(conversationId: string): Promise<ConversationThread>
	loadConversationWorkerTranscript(conversationId: string): Promise<WorkerTranscriptEntry[]>
	loadMemorySnapshot(): Promise<MemorySnapshot>
	updateConfig(config: ResolvedAppConfig): Promise<void>
}
