import { assertMatrixPromptConfigured, type ResolvedAppConfig } from '../config'
import { buildInferenceRequest } from '../inference/execution-profile'
import { createInferenceAdapter } from '../inference/registry'
import type { ConversationStore } from '../storage/conversation-store'
import type { ToolExecutionContext } from '../tools/tool-types'
import type {
	ConversationSummary,
	ConversationThread,
	InferenceEvents,
	ProviderCatalogRecord,
	ProviderModelRecord
} from '../types'

export const DEFAULT_CONVERSATION_TITLE = 'Fresh session'
export const DRAFT_CONVERSATION_ID = 'draft'

export class AgentService {
	constructor(
		private readonly store: ConversationStore,
		private config: ResolvedAppConfig
	) {}

	addUserMessage(conversationId: string, content: string): ConversationThread {
		const prompt = content.trim()
		if (!prompt) {
			throw new Error('Cannot send an empty prompt.')
		}

		if (isDraftConversationId(conversationId)) {
			const thread = this.store.createConversation({
				model: this.config.providers.fireworks.model,
				provider: this.config.defaultProvider,
				title: toConversationTitle(prompt)
			})

			this.store.appendMessage({ content: prompt, conversationId: thread.conversation.id, role: 'user' })

			return this.loadConversation(thread.conversation.id)
		}

		const existing = this.loadConversation(conversationId)
		if (existing.conversation.title === DEFAULT_CONVERSATION_TITLE) {
			this.store.renameConversation(conversationId, toConversationTitle(prompt))
		}

		this.store.appendMessage({ content: prompt, conversationId, role: 'user' })

		return this.loadConversation(conversationId)
	}

	createDraftConversation(): ConversationThread {
		const now = new Date().toISOString()

		return {
			conversation: {
				createdAt: now,
				id: DRAFT_CONVERSATION_ID,
				model: this.config.providers.fireworks.model,
				provider: this.config.defaultProvider,
				title: DEFAULT_CONVERSATION_TITLE,
				updatedAt: now
			},
			messages: [],
			toolCallMessages: []
		}
	}

	deleteAllConversations(): void {
		this.store.deleteAllConversations()
	}

	deleteConversation(conversationId: string): void {
		if (isDraftConversationId(conversationId)) {
			return
		}

		this.store.deleteConversation(conversationId)
	}

	async generateAssistantReply(
		conversationId: string,
		signal?: AbortSignal,
		events?: InferenceEvents,
		toolContext: ToolExecutionContext = {}
	): Promise<ConversationThread> {
		assertMatrixPromptConfigured(this.config)
		const thread = this.prepareConversationForReply(conversationId)
		const adapter = createInferenceAdapter(thread.conversation.provider, this.config, toolContext)
		const preparedRequest = buildInferenceRequest({
			config: this.config,
			conversation: thread.conversation,
			events,
			messages: thread.messages,
			signal
		})

		const result = await adapter.complete(preparedRequest.request)

		this.store.appendMessage({
			content: result.content,
			conversationId,
			model: result.model,
			provider: result.provider,
			role: 'assistant'
		})

		return this.loadConversation(conversationId)
	}

	prepareConversationForReply(conversationId: string): ConversationThread {
		const thread = this.loadConversation(conversationId)
		const nextProvider = this.config.defaultProvider
		const nextModel = nextProvider === 'fireworks' ? this.config.providers.fireworks.model : thread.conversation.model

		if (thread.conversation.provider === nextProvider && thread.conversation.model === nextModel) {
			return thread
		}

		this.store.updateConversationInference(conversationId, nextProvider, nextModel)
		return this.loadConversation(conversationId)
	}

	listConversations(limit = 50): ConversationSummary[] {
		return this.store.listConversations(limit)
	}

	getStartupThread(conversations = this.listConversations(1)): ConversationThread {
		const latestConversation = conversations[0]
		return latestConversation ? this.loadConversation(latestConversation.id) : this.createDraftConversation()
	}

	listProviders(): ProviderCatalogRecord[] {
		return this.store.listProviders()
	}

	listProviderModels(providerId: string): ProviderModelRecord[] {
		return this.store.listProviderModels(providerId)
	}

	loadConversation(conversationId: string): ConversationThread {
		if (isDraftConversationId(conversationId)) {
			return this.createDraftConversation()
		}

		const thread = this.store.getConversation(conversationId)
		if (!thread) {
			throw new Error(`Conversation "${conversationId}" was not found.`)
		}

		return thread
	}

	updateConfig(config: ResolvedAppConfig): void {
		this.config = config
	}
}

export function isDraftConversationId(conversationId: string): boolean {
	return conversationId === DRAFT_CONVERSATION_ID
}

export function toConversationTitle(content: string): string {
	const singleLine = content.replaceAll(/\s+/g, ' ').trim()
	if (!singleLine) {
		return DEFAULT_CONVERSATION_TITLE
	}

	if (singleLine.length <= 48) {
		return singleLine
	}

	return `${singleLine.slice(0, 45)}...`
}
