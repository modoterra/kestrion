import type { ResolvedAppConfig } from '../config'
import type { DaemonController } from '../runtime/daemon/controller'
import type { MemorySnapshot } from '../storage/memory-store'
import type { ToolExecutionContext } from '../tools/tool-types'
import type {
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
		_toolContext?: ToolExecutionContext
	): Promise<ConversationThread> {
		const onToolApprovalPrompt = events?.onToolApprovalPrompt
		return this.controller.generateAssistantReply(
			conversationId,
			forwardWorkerEvents(events),
			signal,
			onToolApprovalPrompt ? prompt => Promise.resolve(onToolApprovalPrompt(prompt)) : undefined,
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
		if (event.type === 'textDelta') {
			events?.onTextDelta?.(event.delta)
			return
		}

		if (event.type === 'toolCallsStart') {
			events?.onToolCallsStart?.(event.toolCalls)
			return
		}

		if (event.type === 'toolCallsFinish') {
			events?.onToolCallsFinish?.(event.toolCalls)
		}
	}
}
