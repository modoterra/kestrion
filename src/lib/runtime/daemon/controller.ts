/* eslint-disable import/max-dependencies, max-lines */

import { randomUUID } from 'node:crypto'
import { appendFileSync } from 'node:fs'

import type { ResolvedAppConfig } from '../../config'
import { loadWritableAppConfig } from '../../config'
import type { AppPaths } from '../../paths'
import { isDraftConversationId, type AgentService } from '../../services/agent-service'
import { loadMemorySnapshot } from '../../storage/memory-store'
import {
	authorizeToolCall,
	DENY_ALL_TOOL_POLICY,
	type ToolAuthorizationContext,
	type ToolPolicy
} from '../../tools/policy'
import {
	buildApprovalPrompt,
	buildToolApprovalFingerprint,
	createToolApprovalGrantPolicy,
	isToolApprovalSuppressed,
	mergeToolPolicies
} from '../../tools/tool-approval'
import type { ToolExecutionContext } from '../../tools/tool-types'
import type { ToolApprovalPrompt, ToolApprovalResponse, WorkerTranscriptEntry } from '../../types'
import type { TurnRunner } from '../worker/turn-runner'
import type {
	WorkerHostToolRequest,
	WorkerHostToolResponse,
	WorkerHostMounts,
	WorkerToolAuthorizationRequest,
	WorkerToolAuthorizationResponse,
	WorkerTurnCompletedEvent,
	WorkerTurnEvent
} from '../worker/types'
import { executeDaemonHostedToolRequest } from './hosted-tools'

type ConversationSummary = ReturnType<AgentService['listConversations']>[number]
type ConversationThread = ReturnType<AgentService['createDraftConversation']>
type ProviderModelRecord = ReturnType<AgentService['listProviderModels']>[number]
type ToolCallBatch = Extract<WorkerTurnEvent, { type: 'toolCallsStart' }>['toolCalls']
type ConversationMessageStore = {
	appendMessage: (message: {
		content: string
		conversationId: string
		model: string
		provider: string
		role: 'assistant'
	}) => void
	appendToolCallMessage: (message: { conversationId: string; toolCalls: ToolCallBatch }) => { id: string }
	appendWorkerTranscriptEntry: (entry: Omit<WorkerTranscriptEntry, 'id'>) => WorkerTranscriptEntry
	listConversationWorkerTranscript: (conversationId: string) => WorkerTranscriptEntry[]
	loadToolPolicy: () => ToolPolicy
	markToolCallMessageCompleted: (toolCallMessageId: string) => void
	saveToolPolicy: (policy: ToolPolicy) => ToolPolicy
}

export type DaemonBootstrapResult = {
	config: ResolvedAppConfig
	conversations: ConversationSummary[]
	fireworksModels: ProviderModelRecord[]
	thread: ConversationThread
	writableConfig: ReturnType<typeof loadWritableAppConfig>
}

export class DaemonController {
	private readonly sessionPromptSuppressions = new Set<string>()
	private sessionToolPolicy: ToolPolicy = DENY_ALL_TOOL_POLICY

	constructor(
		private readonly store: ConversationMessageStore,
		private readonly service: AgentService,
		private readonly paths: AppPaths,
		private readonly runner: TurnRunner,
		private config: ResolvedAppConfig
	) {}

	addUserMessage(conversationId: string, content: string): Promise<ConversationThread> {
		return Promise.resolve(this.service.addUserMessage(conversationId, content))
	}

	bootstrap(): Promise<DaemonBootstrapResult> {
		const conversations = this.service.listConversations()
		return Promise.resolve({
			config: this.config,
			conversations,
			fireworksModels: this.service.listProviderModels('fireworks'),
			thread: this.service.getStartupThread(conversations),
			writableConfig: loadWritableAppConfig(this.paths)
		})
	}

	deleteAllConversations(): Promise<void> {
		this.service.deleteAllConversations()
		return Promise.resolve()
	}

	deleteConversation(conversationId: string): Promise<void> {
		this.service.deleteConversation(conversationId)
		return Promise.resolve()
	}

	async generateAssistantReply(
		conversationId: string,
		onEvent: (event: WorkerTurnEvent) => void,
		signal?: AbortSignal,
		onToolApprovalPrompt?: (prompt: ToolApprovalPrompt) => Promise<ToolApprovalResponse>,
		onTranscriptEntry?: (entry: WorkerTranscriptEntry) => void
	): Promise<ConversationThread> {
		const thread = this.service.prepareConversationForReply(conversationId)
		const turnId = randomUUID()
		const runningToolCallMessageIds: string[] = []
		const completion = await this.runTurn(
			conversationId,
			onEvent,
			onToolApprovalPrompt,
			onTranscriptEntry,
			runningToolCallMessageIds,
			signal,
			thread,
			turnId
		)

		this.appendAssistantMessage(completion, conversationId)
		return this.service.loadConversation(conversationId)
	}

	getStartupThread(conversations?: ConversationSummary[]): Promise<ConversationThread> {
		return Promise.resolve(this.service.getStartupThread(conversations))
	}

	listConversations(limit = 50): Promise<ConversationSummary[]> {
		return Promise.resolve(this.service.listConversations(limit))
	}

	listProviderModels(providerId: string): Promise<ProviderModelRecord[]> {
		return Promise.resolve(this.service.listProviderModels(providerId))
	}

	loadConversation(conversationId: string): Promise<ConversationThread> {
		return Promise.resolve(this.service.loadConversation(conversationId))
	}

	loadConversationWorkerTranscript(conversationId: string): Promise<WorkerTranscriptEntry[]> {
		if (isDraftConversationId(conversationId)) {
			return Promise.resolve([])
		}

		return Promise.resolve(this.store.listConversationWorkerTranscript(conversationId))
	}

	loadMemorySnapshot(): Promise<ReturnType<typeof loadMemorySnapshot>> {
		return Promise.resolve(loadMemorySnapshot(this.paths))
	}

	updateConfig(config: ResolvedAppConfig): Promise<void> {
		this.config = config
		this.service.updateConfig(config)
		return Promise.resolve()
	}

	private appendAssistantMessage(result: WorkerTurnCompletedEvent, conversationId: string): void {
		this.store.appendMessage({
			content: result.content,
			conversationId,
			model: result.model,
			provider: result.provider,
			role: 'assistant'
		})
	}

	private writeAuditRecord(
		conversationId: string,
		turnId: string,
		event: Extract<WorkerTurnEvent, { type: 'mutation' }>
	): void {
		const timestamp = new Date().toISOString()
		const auditFile = `${this.paths.auditDir}/${timestamp.slice(0, 10)}.jsonl`
		appendFileSync(auditFile, `${JSON.stringify({ conversationId, mutation: event.mutation, timestamp, turnId })}\n`)
	}

	private async handleWorkerHostToolRequest(
		request: WorkerHostToolRequest,
		hostMounts: WorkerHostMounts,
		onToolApprovalPrompt?: (prompt: ToolApprovalPrompt) => Promise<ToolApprovalResponse>
	): Promise<WorkerHostToolResponse> {
		const authorization = authorizeToolCall(
			request.toolName,
			request.argumentsJson,
			mergeToolPolicies(this.store.loadToolPolicy(), this.sessionToolPolicy),
			hostMounts
		)
		if (!authorization.ok) {
			if (!onToolApprovalPrompt) {
				return { error: authorization.error, requestId: request.requestId, type: 'hostToolError' }
			}

			const fingerprint = buildToolApprovalFingerprint(request.toolName, request.argumentsJson)
			if (isToolApprovalSuppressed(fingerprint, this.store.loadToolPolicy(), this.sessionPromptSuppressions)) {
				return { error: authorization.error, requestId: request.requestId, type: 'hostToolError' }
			}

			const interactiveAuthorization = await this.resolveInteractiveToolApprovalContext(
				hostMounts,
				request.toolName,
				request.argumentsJson,
				authorization.error,
				onToolApprovalPrompt,
				fingerprint
			)
			if (!interactiveAuthorization.ok) {
				return { error: interactiveAuthorization.error, requestId: request.requestId, type: 'hostToolError' }
			}

			return executeDaemonHostedToolRequest(
				this.paths,
				request,
				toToolExecutionContext(interactiveAuthorization.context)
			)
		}

		return executeDaemonHostedToolRequest(this.paths, request, toToolExecutionContext(authorization.context))
	}

	private handleWorkerToolAuthorizationRequest(
		hostMounts: WorkerHostMounts,
		request: WorkerToolAuthorizationRequest,
		onToolApprovalPrompt?: (prompt: ToolApprovalPrompt) => Promise<ToolApprovalResponse>
	): Promise<WorkerToolAuthorizationResponse> {
		const resolvedPolicy = mergeToolPolicies(this.store.loadToolPolicy(), this.sessionToolPolicy)
		const authorization = authorizeToolCall(request.toolName, request.argumentsJson, resolvedPolicy, hostMounts)
		if (authorization.ok) {
			return Promise.resolve({
				context: authorization.context,
				requestId: request.requestId,
				type: 'toolAuthorizationAllow'
			})
		}

		const fingerprint = buildToolApprovalFingerprint(request.toolName, request.argumentsJson)
		if (
			isToolApprovalSuppressed(fingerprint, resolvedPolicy, this.sessionPromptSuppressions) ||
			!onToolApprovalPrompt
		) {
			return Promise.resolve({
				error: authorization.error,
				requestId: request.requestId,
				type: 'toolAuthorizationDeny'
			})
		}

		return this.resolveInteractiveWorkerToolAuthorization(
			hostMounts,
			request,
			authorization.error,
			onToolApprovalPrompt,
			fingerprint
		)
	}

	private async resolveInteractiveToolApprovalContext(
		hostMounts: WorkerHostMounts,
		toolName: string,
		argumentsJson: string,
		denialReason: string,
		onToolApprovalPrompt: (prompt: ToolApprovalPrompt) => Promise<ToolApprovalResponse>,
		fingerprint: string
	): Promise<{ context: ToolAuthorizationContext; ok: true } | { error: string; ok: false }> {
		const prompt = buildApprovalPrompt(randomUUID(), toolName, argumentsJson, denialReason)
		const decision = await onToolApprovalPrompt(prompt)
		if (decision.mode === 'allowOnce') {
			return this.resolveGrantedAuthorizationContext(hostMounts, toolName, argumentsJson)
		}

		if (decision.mode === 'allowSession') {
			const grantPolicy = createToolApprovalGrantPolicy(toolName, argumentsJson, hostMounts)
			if (!grantPolicy) {
				return { error: 'Unable to derive a session approval grant for this tool call.', ok: false }
			}

			this.sessionToolPolicy = mergeToolPolicies(this.sessionToolPolicy, grantPolicy)
			return this.resolveGrantedAuthorizationContext(hostMounts, toolName, argumentsJson)
		}

		if (decision.mode === 'allowForever') {
			const grantPolicy = createToolApprovalGrantPolicy(toolName, argumentsJson, hostMounts)
			if (!grantPolicy) {
				return { error: 'Unable to derive a persistent approval grant for this tool call.', ok: false }
			}

			this.store.saveToolPolicy(mergeToolPolicies(this.store.loadToolPolicy(), grantPolicy))
			return this.resolveGrantedAuthorizationContext(hostMounts, toolName, argumentsJson)
		}

		if (decision.mode === 'denyForever') {
			const persistedPolicy = this.store.loadToolPolicy()
			this.store.saveToolPolicy({
				...persistedPolicy,
				promptSuppressions: [...persistedPolicy.promptSuppressions, fingerprint]
			})
			this.sessionPromptSuppressions.add(fingerprint)
			return { error: buildInteractiveDenialMessage(decision), ok: false }
		}

		return { error: buildInteractiveDenialMessage(decision), ok: false }
	}

	private async resolveInteractiveWorkerToolAuthorization(
		hostMounts: WorkerHostMounts,
		request: WorkerToolAuthorizationRequest,
		denialReason: string,
		onToolApprovalPrompt: (prompt: ToolApprovalPrompt) => Promise<ToolApprovalResponse>,
		fingerprint: string
	): Promise<WorkerToolAuthorizationResponse> {
		const interactiveAuthorization = await this.resolveInteractiveToolApprovalContext(
			hostMounts,
			request.toolName,
			request.argumentsJson,
			denialReason,
			onToolApprovalPrompt,
			fingerprint
		)
		return interactiveAuthorization.ok
			? { context: interactiveAuthorization.context, requestId: request.requestId, type: 'toolAuthorizationAllow' }
			: { error: interactiveAuthorization.error, requestId: request.requestId, type: 'toolAuthorizationDeny' }
	}

	private resolveGrantedAuthorizationContext(
		hostMounts: WorkerHostMounts,
		toolName: string,
		argumentsJson: string
	): { context: ToolAuthorizationContext; ok: true } | { error: string; ok: false } {
		const grantPolicy = createToolApprovalGrantPolicy(toolName, argumentsJson, hostMounts)
		if (!grantPolicy) {
			return { error: 'Unable to derive an approval grant for this tool call.', ok: false }
		}

		const authorization = authorizeToolCall(
			toolName,
			argumentsJson,
			mergeToolPolicies(mergeToolPolicies(this.store.loadToolPolicy(), this.sessionToolPolicy), grantPolicy),
			hostMounts
		)
		return authorization.ok ? { context: authorization.context, ok: true } : { error: authorization.error, ok: false }
	}

	private finalizeRunningToolCallMessages(runningToolCallMessageIds: string[]): void {
		for (const toolCallMessageId of runningToolCallMessageIds.splice(0)) {
			this.store.markToolCallMessageCompleted(toolCallMessageId)
		}
	}

	private handleTurnEvent(
		conversationId: string,
		turnId: string,
		runningToolCallMessageIds: string[],
		onEvent: (event: WorkerTurnEvent) => void,
		event: WorkerTurnEvent
	): void {
		if (event.type === 'mutation') {
			this.writeAuditRecord(conversationId, turnId, event)
		}

		if (event.type === 'toolCallsStart') {
			const message = this.store.appendToolCallMessage({ conversationId, toolCalls: event.toolCalls })
			runningToolCallMessageIds.push(message.id)
		}

		if (event.type === 'toolCallsFinish') {
			const toolCallMessageId = runningToolCallMessageIds.pop()
			if (toolCallMessageId) {
				this.store.markToolCallMessageCompleted(toolCallMessageId)
			}
		}

		onEvent(event)
	}

	private async runTurn(
		conversationId: string,
		onEvent: (event: WorkerTurnEvent) => void,
		onToolApprovalPrompt: ((prompt: ToolApprovalPrompt) => Promise<ToolApprovalResponse>) | undefined,
		onTranscriptEntry: ((entry: WorkerTranscriptEntry) => void) | undefined,
		runningToolCallMessageIds: string[],
		signal: AbortSignal | undefined,
		thread: ConversationThread,
		turnId: string
	): Promise<WorkerTurnCompletedEvent> {
		const hostMounts = { agentRoot: this.paths.agentDir, configRoot: this.paths.configDir }
		try {
			return await this.runner.runTurn(
				{ config: this.config, conversation: thread.conversation, hostMounts, messages: thread.messages, turnId },
				event => {
					this.handleTurnEvent(conversationId, turnId, runningToolCallMessageIds, onEvent, event)
				},
				signal,
				request => this.handleWorkerToolAuthorizationRequest(hostMounts, request, onToolApprovalPrompt),
				request => this.handleWorkerHostToolRequest(request, hostMounts, onToolApprovalPrompt),
				entry => {
					const savedEntry = this.store.appendWorkerTranscriptEntry(entry)
					onTranscriptEntry?.(savedEntry)
				}
			)
		} finally {
			this.finalizeRunningToolCallMessages(runningToolCallMessageIds)
		}
	}
}

function toToolExecutionContext(context: ToolAuthorizationContext): ToolExecutionContext {
	return {
		allowedMemoryKinds: context.allowedMemoryKinds,
		allowedSkillNames: context.allowedSkillNames,
		fileAccessPolicy: context.fileAccessPolicy,
		networkAccessPolicy: context.networkAccessPolicy,
		todoAllowed: context.todoAllowed
	}
}

function buildInteractiveDenialMessage(decision: ToolApprovalResponse): string {
	if (decision.mode === 'other' && decision.explanation?.trim()) {
		return decision.explanation.trim()
	}

	return 'Tool call denied by the user.'
}
