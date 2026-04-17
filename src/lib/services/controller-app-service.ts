import type { ResolvedAppConfig } from '../config'
import type { McpToolCallResult, McpToolListing } from '../mcp/types'
import type { DaemonController } from '../runtime/daemon/controller'
import type { MemorySnapshot } from '../storage/memory-store'
import type { ToolExecutionContext } from '../tools/tool-types'
import type {
	ConversationCompactionResult,
	ConversationSummary,
	ConversationThread,
	InferenceEvents,
	ProviderModelRecord,
	WorkerTranscriptEntry
} from '../types'
import type { AgentService } from './agent-service'
import type { AppService } from './app-service'

export class ControllerAppService implements AppService {
	constructor(
		private readonly controller: DaemonController,
		private readonly agentService: AgentService
	) {}

	addUserMessage(conversationId: string, content: string): Promise<ConversationThread> {
		return this.controller.addUserMessage(conversationId, content)
	}

	callMcpTool(toolName: string, argumentsJson: string): Promise<McpToolCallResult> {
		return this.controller.callMcpTool(toolName, argumentsJson)
	}

	compactConversation(conversationId: string): Promise<ConversationCompactionResult> {
		return this.controller.compactConversation(conversationId)
	}

	createDraftConversation(): ConversationThread {
		return this.agentService.createDraftConversation()
	}

	deleteAllConversations(): Promise<void> {
		return this.controller.deleteAllConversations()
	}

	deleteConversation(conversationId: string): Promise<void> {
		return this.controller.deleteConversation(conversationId)
	}

	generateAssistantReply(
		conversationId: string,
		signal?: AbortSignal,
		events?: InferenceEvents,
		toolContext?: ToolExecutionContext
	): Promise<ConversationThread> {
		const onToolApprovalPrompt = events?.onToolApprovalPrompt
		const askQuestion = toolContext?.askQuestion
		return this.controller.generateAssistantReply(
			conversationId,
			forwardWorkerEvents(events),
			signal,
			onToolApprovalPrompt ? prompt => Promise.resolve(onToolApprovalPrompt(prompt)) : undefined,
			askQuestion ? prompt => askQuestion(prompt) : undefined,
			entry => {
				events?.onWorkerTranscriptEntry?.(entry)
			}
		)
	}

	getStartupThread(conversations?: ConversationSummary[]): Promise<ConversationThread> {
		return this.controller.getStartupThread(conversations)
	}

	listConversations(limit?: number): Promise<ConversationSummary[]> {
		return this.controller.listConversations(limit)
	}

	listMcpTools(): Promise<McpToolListing> {
		return this.controller.listMcpTools()
	}

	listProviderModels(providerId: string): Promise<ProviderModelRecord[]> {
		return this.controller.listProviderModels(providerId)
	}

	loadConversation(conversationId: string): Promise<ConversationThread> {
		return this.controller.loadConversation(conversationId)
	}

	loadConversationWorkerTranscript(conversationId: string): Promise<WorkerTranscriptEntry[]> {
		return this.controller.loadConversationWorkerTranscript(conversationId)
	}

	loadMemorySnapshot(): Promise<MemorySnapshot> {
		return this.controller.loadMemorySnapshot()
	}

	updateConfig(config: ResolvedAppConfig): Promise<void> {
		return this.controller.updateConfig(config)
	}
}

function forwardWorkerEvents(
	events: InferenceEvents | undefined
): Parameters<DaemonController['generateAssistantReply']>[1] {
	return event => {
		switch (event.type) {
			case 'textDelta':
				events?.onTextDelta?.(event.delta)
				break
			case 'toolCallsStart':
				events?.onToolCallsStart?.(event.toolCalls)
				break
			case 'toolCallsFinish':
				events?.onToolCallsFinish?.(event.toolCalls)
				break
			case 'toolAudit':
			case 'mutation':
			case 'completed':
				break
		}
	}
}
