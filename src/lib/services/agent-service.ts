import { assertMatrixPromptConfigured, type ResolvedAppConfig } from '../config'
import {
	buildCompactionRequest,
	buildInferenceRequest,
	getSerializedInferenceHistoryChars
} from '../inference/execution-profile'
import { createInferenceAdapter } from '../inference/registry'
import type { DaemonLogger } from '../runtime/daemon/logger'
import { createNoopDaemonLogger } from '../runtime/daemon/logger'
import type { ConversationStore } from '../storage/conversation-store'
import type { ToolExecutionContext } from '../tools/tool-types'
import type {
	ConversationCompactionRecord,
	ConversationCompactionResult,
	ConversationSummary,
	ConversationThread,
	InferenceEvents,
	MessageRecord,
	ProviderCatalogRecord,
	ProviderModelRecord
} from '../types'

export const DEFAULT_CONVERSATION_TITLE = 'Fresh session'
export const DRAFT_CONVERSATION_ID = 'draft'
const MAX_COMPACTION_SUMMARY_CHARACTERS = 1200

export type PreparedConversationReply = {
	compaction: ConversationCompactionRecord | null
	thread: ConversationThread
}

export class AgentService {
	constructor(
		private readonly store: ConversationStore,
		private config: ResolvedAppConfig,
		private readonly logger: DaemonLogger = createNoopDaemonLogger()
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
			compaction: null,
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

	async compactConversation(conversationId: string): Promise<ConversationCompactionResult> {
		this.logger.info('conversation.compact.requested', { conversationId })
		if (isDraftConversationId(conversationId)) {
			this.logger.info('conversation.compact.skipped', { conversationId, reason: 'draft' })
			return { compacted: false, conversationId, reason: 'draft' }
		}

		const thread = this.syncConversationInference(conversationId)
		const compacted = await this.compactLoadedConversation(thread)
		this.logger.info('conversation.compact.completed', {
			compacted,
			conversationId,
			reason: compacted ? 'updated' : 'no-op'
		})

		return { compacted, conversationId, reason: compacted ? 'updated' : 'no-op' }
	}

	async generateAssistantReply(
		conversationId: string,
		signal?: AbortSignal,
		events?: InferenceEvents,
		toolContext: ToolExecutionContext = {}
	): Promise<ConversationThread> {
		assertMatrixPromptConfigured(this.config)
		const preparedReply = await this.prepareConversationForReply(conversationId)
		const adapter = createInferenceAdapter(preparedReply.thread.conversation.provider, this.config, toolContext)
		const preparedRequest = buildInferenceRequest({
			compaction: preparedReply.compaction,
			config: this.config,
			conversation: preparedReply.thread.conversation,
			events,
			messages: preparedReply.thread.messages,
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

	async prepareConversationForReply(conversationId: string): Promise<PreparedConversationReply> {
		const thread = this.syncConversationInference(conversationId)

		try {
			await this.maybeAutoCompactConversation(thread)
		} catch {}

		const refreshedThread = this.loadConversation(conversationId)

		return {
			compaction: this.getValidConversationCompaction(conversationId, refreshedThread.messages),
			thread: refreshedThread
		}
	}

	private syncConversationInference(conversationId: string): ConversationThread {
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

	private async maybeAutoCompactConversation(thread: ConversationThread): Promise<void> {
		const existingCompaction = this.getValidConversationCompaction(thread.conversation.id, thread.messages)
		const rawSuffix = getMessagesAfterCompaction(thread.messages, existingCompaction)
		const rawSuffixTurns = splitConversationTurns(rawSuffix).length
		const rawSuffixChars = getSerializedInferenceHistoryChars(rawSuffix)
		const shouldCompact = shouldAutoCompactConversation(rawSuffix, this.config)
		this.logger.debug('conversation.compact.auto.evaluate', {
			compactedThroughMessageId: existingCompaction?.compactedThroughMessageId ?? null,
			conversationId: thread.conversation.id,
			rawSuffixChars,
			rawSuffixTurns,
			shouldCompact,
			thresholdChars: this.config.providers.fireworks.compactAutoPromptChars,
			thresholdTurns: this.config.providers.fireworks.compactAutoTurnThreshold
		})
		if (!shouldCompact) {
			return
		}

		await this.saveCompactionCheckpoint(thread, existingCompaction, 'auto')
	}

	private async compactLoadedConversation(thread: ConversationThread): Promise<boolean> {
		const existingCompaction = this.getValidConversationCompaction(thread.conversation.id, thread.messages)
		return this.saveCompactionCheckpoint(thread, existingCompaction, 'manual')
	}

	private getValidConversationCompaction(
		conversationId: string,
		messages: MessageRecord[]
	): ConversationCompactionRecord | null {
		const compaction = this.store.getConversationCompaction(conversationId)
		if (!compaction) {
			return null
		}

		if (messages.some(message => message.id === compaction.compactedThroughMessageId)) {
			return compaction
		}

		this.store.deleteConversationCompaction(conversationId)
		return null
	}

	private async saveCompactionCheckpoint(
		thread: ConversationThread,
		existingCompaction: ConversationCompactionRecord | null,
		trigger: 'auto' | 'manual'
	): Promise<boolean> {
		const rawSuffix = getMessagesAfterCompaction(thread.messages, existingCompaction)
		const plan = buildCompactionPlan(rawSuffix, this.config)
		this.logger.info('conversation.compact.plan', {
			compactedMessageCount: plan.messagesToCompact.length,
			compactedTurnCount: plan.compactedTurnCount,
			compactedThroughMessageId: existingCompaction?.compactedThroughMessageId ?? null,
			conversationId: thread.conversation.id,
			rawSuffixChars: plan.rawSuffixCharCount,
			rawSuffixTurns: plan.totalTurnCount,
			retainedTurnCount: plan.retainedTurnCount,
			tailTurnLimit: this.config.providers.fireworks.compactTailTurns,
			trigger
		})
		const messagesToCompact = plan.messagesToCompact
		const compactedThroughMessage = messagesToCompact.at(-1)
		if (!compactedThroughMessage) {
			this.logger.info('conversation.compact.skipped', {
				conversationId: thread.conversation.id,
				rawSuffixChars: plan.rawSuffixCharCount,
				rawSuffixTurns: plan.totalTurnCount,
				reason: 'no_messages_before_retained_suffix',
				retainedTurnCount: plan.retainedTurnCount,
				trigger
			})
			return false
		}

		const adapter = createInferenceAdapter(thread.conversation.provider, this.config)
		const summaryRequest = buildCompactionRequest({
			config: this.config,
			conversation: thread.conversation,
			existingSummary: existingCompaction?.summary,
			messagesToCompact
		})
		this.logger.debug('conversation.compact.summary.requested', {
			compactedThroughMessageId: compactedThroughMessage.id,
			conversationId: thread.conversation.id,
			existingSummaryChars: existingCompaction?.summary.length ?? 0,
			messagesToCompact: messagesToCompact.length,
			trigger
		})
		const result = await adapter.complete(summaryRequest)
		const summary = trimCompactionSummary(result.content)

		this.store.saveConversationCompaction({
			compactedThroughMessageId: compactedThroughMessage.id,
			conversationId: thread.conversation.id,
			summary
		})
		this.logger.info('conversation.compact.saved', {
			compactedThroughMessageId: compactedThroughMessage.id,
			conversationId: thread.conversation.id,
			summaryChars: summary.length,
			trigger
		})
		return true
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

function getMessagesAfterCompaction(
	messages: MessageRecord[],
	compaction: ConversationCompactionRecord | null
): MessageRecord[] {
	if (!compaction) {
		return messages
	}

	const compactedThroughIndex = messages.findIndex(message => message.id === compaction.compactedThroughMessageId)
	return compactedThroughIndex < 0 ? messages : messages.slice(compactedThroughIndex + 1)
}

function getMessagesToCompact(messages: MessageRecord[], config: ResolvedAppConfig): MessageRecord[] {
	return buildCompactionPlan(messages, config).messagesToCompact
}

function buildCompactionPlan(
	messages: MessageRecord[],
	config: ResolvedAppConfig
): {
	compactedTurnCount: number
	messagesToCompact: MessageRecord[]
	rawSuffixCharCount: number
	retainedTurnCount: number
	totalTurnCount: number
} {
	const turns = splitConversationTurns(messages)
	const retainedTurnCount = getRetainedTurnCount(turns, config)
	const turnsToCompact = retainedTurnCount >= turns.length ? [] : turns.slice(0, -retainedTurnCount)

	return {
		compactedTurnCount: turnsToCompact.length,
		messagesToCompact: turnsToCompact.flatMap(turn => turn),
		rawSuffixCharCount: getSerializedInferenceHistoryChars(messages),
		retainedTurnCount,
		totalTurnCount: turns.length
	}
}

function getRetainedTurnCount(turns: MessageRecord[][], config: ResolvedAppConfig): number {
	if (turns.length <= 1) {
		return turns.length
	}

	const fireworksConfig = config.providers.fireworks
	let retainedTurnCount = Math.min(turns.length, fireworksConfig.compactTailTurns)

	while (
		retainedTurnCount > 1 &&
		getSerializedInferenceHistoryChars(turns.slice(-retainedTurnCount).flat()) > fireworksConfig.compactAutoPromptChars
	) {
		retainedTurnCount -= 1
	}

	return retainedTurnCount
}

function splitConversationTurns(messages: MessageRecord[]): MessageRecord[][] {
	const turns: MessageRecord[][] = []
	let currentTurn: MessageRecord[] = []

	for (const message of messages) {
		if (message.role === 'user' && currentTurn.length > 0) {
			turns.push(currentTurn)
			currentTurn = [message]
			continue
		}

		currentTurn.push(message)
	}

	if (currentTurn.length > 0) {
		turns.push(currentTurn)
	}

	return turns
}

function shouldAutoCompactConversation(messages: MessageRecord[], config: ResolvedAppConfig): boolean {
	const fireworksConfig = config.providers.fireworks
	return (
		splitConversationTurns(messages).length > fireworksConfig.compactAutoTurnThreshold ||
		getSerializedInferenceHistoryChars(messages) > fireworksConfig.compactAutoPromptChars
	)
}

function trimCompactionSummary(content: string): string {
	const normalized = content.replaceAll(/\s+/g, ' ').trim()
	if (normalized.length <= MAX_COMPACTION_SUMMARY_CHARACTERS) {
		return normalized
	}

	return `${normalized.slice(0, MAX_COMPACTION_SUMMARY_CHARACTERS - 3).trimEnd()}...`
}
