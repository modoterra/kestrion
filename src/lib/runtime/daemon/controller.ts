/* eslint-disable import/max-dependencies, max-lines */

import { randomUUID } from 'node:crypto'

import { assertMatrixPromptConfigured, loadWritableAppConfig, type ResolvedAppConfig } from '../../config'
import { buildInferenceRequest } from '../../inference/execution-profile'
import { createInferenceAdapter } from '../../inference/registry'
import { loadIntegrityStatus } from '../../integrity/state'
import type { IntegrityStatus } from '../../integrity/types'
import { callMcpTool as executeMcpToolCall, listMcpTools as loadMcpToolListing } from '../../mcp/client'
import type { McpToolCallResult, McpToolListing } from '../../mcp/types'
import type { AppPaths } from '../../paths'
import type { DaemonLogger } from './logger'
import { createNoopDaemonLogger } from './logger'
import { isDraftConversationId, type AgentService } from '../../services/agent-service'
import { loadMemorySnapshot } from '../../storage/memory-store'
import { APP_TOOL_REGISTRY } from '../../tools/app-tool-registry'
import { createDeniedToolAuditRecord } from '../../tools/audit'
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
import type { RegisteredTool, ToolExecutionContext, ToolInvocationAuditRecord } from '../../tools/tool-types'
import type { ToolQuestionAnswer, ToolQuestionPrompt } from '../../tools/tool-types'
import { WORKSPACE_TOOL_REGISTRY } from '../../tools/workspace-tool-registry'
import type {
	ConversationCompactionResult,
	ToolApprovalPrompt,
	ToolApprovalResponse,
	WorkerTranscriptEntry
} from '../../types'
import type { TurnRunner } from '../worker/turn-runner'
import type { WorkerExecutionEvent, WorkerHostMounts, WorkerTurnCompletedEvent, WorkerTurnEvent } from '../worker/types'
import { appendMutationAuditRecord, appendToolInvocationAuditRecord } from './audit'

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
	integrity: IntegrityStatus
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
		private config: ResolvedAppConfig,
		private readonly logger: DaemonLogger = createNoopDaemonLogger()
	) {}

	addUserMessage(conversationId: string, content: string): Promise<ConversationThread> {
		this.logger.info('conversation.user_message.add', { contentLength: content.length, conversationId })
		return Promise.resolve(this.service.addUserMessage(conversationId, content))
	}

	callMcpTool(toolName: string, argumentsJson: string): Promise<McpToolCallResult> {
		this.logger.info('mcp.tool.call', { toolName })
		return executeMcpToolCall(this.config.mcp, toolName, argumentsJson)
	}

	compactConversation(conversationId: string): Promise<ConversationCompactionResult> {
		this.logger.info('conversation.compact.forward', { conversationId })
		return this.service.compactConversation(conversationId).then(result => {
			this.logger.info('conversation.compact.result', {
				compacted: result.compacted,
				conversationId: result.conversationId,
				reason: result.reason
			})
			return result
		})
	}

	bootstrap(): Promise<DaemonBootstrapResult> {
		const conversations = this.service.listConversations()
		return Promise.resolve({
			config: this.config,
			conversations,
			fireworksModels: this.service.listProviderModels('fireworks'),
			integrity: loadIntegrityStatus(this.paths),
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
		askQuestion?: (prompt: ToolQuestionPrompt) => Promise<ToolQuestionAnswer>,
		onTranscriptEntry?: (entry: WorkerTranscriptEntry) => void
	): Promise<ConversationThread> {
		const preparedReply = await this.service.prepareConversationForReply(conversationId)
		const turnId = randomUUID()
		const runningToolCallMessageIds: string[] = []
		this.logger.info('turn.started', {
			compactionApplied: preparedReply.compaction !== null,
			conversationId,
			messageCount: preparedReply.thread.messages.length,
			turnId
		})
		const completion = await this.runTurn(
			conversationId,
			onEvent,
			onToolApprovalPrompt,
			askQuestion,
			onTranscriptEntry,
			runningToolCallMessageIds,
			signal,
			preparedReply,
			turnId
		)

		this.appendAssistantMessage(completion, conversationId)
		this.logger.info('turn.completed', {
			contentLength: completion.content.length,
			conversationId,
			model: completion.model,
			provider: completion.provider,
			turnId
		})
		return this.service.loadConversation(conversationId)
	}

	getStartupThread(conversations?: ConversationSummary[]): Promise<ConversationThread> {
		return Promise.resolve(this.service.getStartupThread(conversations))
	}

	listConversations(limit = 50): Promise<ConversationSummary[]> {
		return Promise.resolve(this.service.listConversations(limit))
	}

	listMcpTools(): Promise<McpToolListing> {
		this.logger.info('mcp.tools.list', { enabled: this.config.mcp.enabled })
		return loadMcpToolListing(this.config.mcp)
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
		this.logger.info('config.updated', {
			compactAutoPromptChars: config.providers.fireworks.compactAutoPromptChars,
			compactAutoTurnThreshold: config.providers.fireworks.compactAutoTurnThreshold,
			compactTailTurns: config.providers.fireworks.compactTailTurns,
			model: config.providers.fireworks.model,
			providerMode: config.providers.fireworks.providerMode
		})
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

	private writeMutationAuditRecord(
		conversationId: string,
		turnId: string,
		event: Extract<WorkerTurnEvent, { type: 'mutation' }>
	): void {
		appendMutationAuditRecord(
			this.paths,
			{ conversationId, timestamp: new Date().toISOString(), turnId },
			event.mutation
		)
	}

	private writeToolInvocationAuditRecord(
		conversationId: string,
		turnId: string,
		tool: ToolInvocationAuditRecord
	): void {
		appendToolInvocationAuditRecord(this.paths, { conversationId, timestamp: new Date().toISOString(), turnId }, tool)
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
		this.logger.debug('turn.event', summarizeWorkerTurnEvent(conversationId, turnId, event))
		if (event.type === 'mutation') {
			this.writeMutationAuditRecord(conversationId, turnId, event)
		}

		if (event.type === 'toolAudit') {
			this.writeToolInvocationAuditRecord(conversationId, turnId, event.audit)
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

	private async resolveToolAuthorization(
		conversationId: string,
		hostMounts: WorkerHostMounts,
		toolName: string,
		argumentsJson: string,
		turnId: string,
		onToolApprovalPrompt?: (prompt: ToolApprovalPrompt) => Promise<ToolApprovalResponse>
	): Promise<{ context: ToolAuthorizationContext; ok: true } | { error: string; ok: false }> {
		if (toolName === 'question') {
			return { context: {}, ok: true }
		}

		const resolvedPolicy = mergeToolPolicies(this.store.loadToolPolicy(), this.sessionToolPolicy)
		const authorization = authorizeToolCall(toolName, argumentsJson, resolvedPolicy, hostMounts)
		if (authorization.ok) {
			return { context: authorization.context, ok: true }
		}

		const fingerprint = buildToolApprovalFingerprint(toolName, argumentsJson)
		if (
			isToolApprovalSuppressed(fingerprint, resolvedPolicy, this.sessionPromptSuppressions) ||
			!onToolApprovalPrompt
		) {
			this.writeToolInvocationAuditRecord(
				conversationId,
				turnId,
				createDeniedToolAuditRecord(toolName, argumentsJson, authorization.error)
			)
			return { error: authorization.error, ok: false }
		}

		const interactiveAuthorization = await this.resolveInteractiveToolApprovalContext(
			hostMounts,
			toolName,
			argumentsJson,
			authorization.error,
			onToolApprovalPrompt,
			fingerprint
		)
		if (!interactiveAuthorization.ok) {
			this.writeToolInvocationAuditRecord(
				conversationId,
				turnId,
				createDeniedToolAuditRecord(toolName, argumentsJson, interactiveAuthorization.error)
			)
			return { error: interactiveAuthorization.error, ok: false }
		}

		return interactiveAuthorization
	}

	private createToolRegistry(
		conversationId: string,
		conversationModel: string,
		conversationProvider: string,
		hostMounts: WorkerHostMounts,
		turnId: string,
		onEvent: (event: WorkerTurnEvent) => void,
		onToolApprovalPrompt: ((prompt: ToolApprovalPrompt) => Promise<ToolApprovalResponse>) | undefined,
		askQuestion: ((prompt: ToolQuestionPrompt) => Promise<ToolQuestionAnswer>) | undefined,
		workspaceToolExecutor: (
			toolName: string,
			argumentsJson: string,
			context: ToolAuthorizationContext
		) => Promise<string>
	): RegisteredTool[] {
		const workspaceToolNames = new Set(WORKSPACE_TOOL_REGISTRY.map(tool => tool.name))
		return [...WORKSPACE_TOOL_REGISTRY, ...APP_TOOL_REGISTRY].map(tool => ({
			...tool,
			execute: async (argumentsJson, context) => {
				const authorization = await this.resolveToolAuthorization(
					conversationId,
					hostMounts,
					tool.name,
					argumentsJson,
					turnId,
					onToolApprovalPrompt
				)
				if (!authorization.ok) {
					throw new Error(authorization.error)
				}

				if (workspaceToolNames.has(tool.name)) {
					return workspaceToolExecutor(tool.name, argumentsJson, authorization.context)
				}

				return tool.execute(argumentsJson, {
					...mergeAuthorizedToolContext(context, authorization.context),
					appPaths: this.paths,
					askQuestion,
					memoryOrigin: {
						conversationId,
						model: conversationModel,
						provider: conversationProvider,
						toolName: tool.name,
						turnId
					},
					onAuditRecord: auditRecord => {
						this.handleTurnEvent(conversationId, turnId, [], onEvent, { audit: auditRecord, type: 'toolAudit' })
					}
				})
			},
			metadata: tool.metadata
		}))
	}

	private async runTurn(
		conversationId: string,
		onEvent: (event: WorkerTurnEvent) => void,
		onToolApprovalPrompt: ((prompt: ToolApprovalPrompt) => Promise<ToolApprovalResponse>) | undefined,
		askQuestion: ((prompt: ToolQuestionPrompt) => Promise<ToolQuestionAnswer>) | undefined,
		onTranscriptEntry: ((entry: WorkerTranscriptEntry) => void) | undefined,
		runningToolCallMessageIds: string[],
		signal: AbortSignal | undefined,
		preparedReply: Awaited<ReturnType<AgentService['prepareConversationForReply']>>,
		turnId: string
	): Promise<WorkerTurnCompletedEvent> {
		const thread = preparedReply.thread
		const hostMounts = { agentRoot: this.paths.agentDir, configRoot: this.paths.configDir }
		assertMatrixPromptConfigured(this.config)
		const session = await this.runner.startSession(
			{ conversation: thread.conversation, hostMounts, turnId },
			signal,
			entry => {
				const savedEntry = this.store.appendWorkerTranscriptEntry(entry)
				this.logger.debug('turn.transcript', {
					conversationId,
					direction: savedEntry.direction,
					kind: savedEntry.kind,
					sequence: savedEntry.sequence,
					turnId
				})
				onTranscriptEntry?.(savedEntry)
			},
			(_event: WorkerExecutionEvent) => {}
		)

		try {
			const toolRegistry = this.createToolRegistry(
				conversationId,
				thread.conversation.model,
				thread.conversation.provider,
				hostMounts,
				turnId,
				onEvent,
				onToolApprovalPrompt,
				askQuestion,
				async (toolName, argumentsJson, authorization) => {
					const response = await session.executeTool({
						argumentsJson,
						authorization,
						requestId: randomUUID(),
						toolName
					})
					for (const audit of response.audits) {
						this.handleTurnEvent(conversationId, turnId, runningToolCallMessageIds, onEvent, {
							audit,
							type: 'toolAudit'
						})
					}
					for (const mutation of response.mutations) {
						this.handleTurnEvent(conversationId, turnId, runningToolCallMessageIds, onEvent, {
							mutation,
							type: 'mutation'
						})
					}
					if (!response.ok) {
						return JSON.stringify({ error: response.error ?? 'Worker tool execution failed.', ok: false })
					}

					return response.result ?? JSON.stringify({ ok: true })
				}
			)
			const adapter = createInferenceAdapter(thread.conversation.provider, this.config, {
				askQuestion,
				onAuditRecord: audit => {
					this.handleTurnEvent(conversationId, turnId, runningToolCallMessageIds, onEvent, { audit, type: 'toolAudit' })
				},
				onMutation: mutation => {
					this.handleTurnEvent(conversationId, turnId, runningToolCallMessageIds, onEvent, {
						mutation,
						type: 'mutation'
					})
				},
				toolRegistry,
				workspaceRoot: this.paths.agentDir
			})
			const preparedRequest = buildInferenceRequest({
				compaction: preparedReply.compaction,
				config: this.config,
				conversation: thread.conversation,
				events: {
					onTextDelta: delta => {
						this.handleTurnEvent(conversationId, turnId, runningToolCallMessageIds, onEvent, {
							delta,
							type: 'textDelta'
						})
					},
					onToolCallsFinish: toolCalls => {
						this.handleTurnEvent(conversationId, turnId, runningToolCallMessageIds, onEvent, {
							toolCalls,
							type: 'toolCallsFinish'
						})
					},
					onToolCallsStart: toolCalls => {
						this.handleTurnEvent(conversationId, turnId, runningToolCallMessageIds, onEvent, {
							toolCalls,
							type: 'toolCallsStart'
						})
					}
				},
				messages: thread.messages,
				signal
			})
			const result = await adapter.complete(preparedRequest.request)
			return { content: result.content, model: result.model, provider: result.provider, type: 'completed' }
		} finally {
			await session.close()
			this.finalizeRunningToolCallMessages(runningToolCallMessageIds)
		}
	}
}

function toToolExecutionContext(
	context: ToolAuthorizationContext,
	onAuditRecord?: ToolExecutionContext['onAuditRecord']
): ToolExecutionContext {
	return {
		allowedMemoryKinds: context.allowedMemoryKinds,
		allowedSkillNames: context.allowedSkillNames,
		fileAccessPolicy: context.fileAccessPolicy,
		networkAccessPolicy: context.networkAccessPolicy,
		onAuditRecord,
		todoAllowed: context.todoAllowed
	}
}

function buildInteractiveDenialMessage(decision: ToolApprovalResponse): string {
	if (decision.mode === 'other' && decision.explanation?.trim()) {
		return decision.explanation.trim()
	}

	return 'Tool call denied by the user.'
}

function summarizeWorkerTurnEvent(
	conversationId: string,
	turnId: string,
	event: WorkerTurnEvent
): Record<string, unknown> {
	switch (event.type) {
		case 'textDelta':
			return {
				conversationId,
				deltaLength: event.delta.length,
				deltaPreview: event.delta.slice(0, 80),
				turnId,
				type: event.type
			}
		case 'toolCallsStart':
		case 'toolCallsFinish':
			return {
				conversationId,
				toolCallCount: event.toolCalls.length,
				toolNames: event.toolCalls.map(toolCall => toolCall.name),
				turnId,
				type: event.type
			}
		case 'toolAudit':
			return {
				conversationId,
				toolName: event.audit.toolName,
				turnId,
				type: event.type
			}
		case 'mutation':
			return {
				conversationId,
				mutationType: event.mutation.operation,
				turnId,
				type: event.type
			}
		case 'completed':
			return {
				contentLength: event.content.length,
				conversationId,
				model: event.model,
				provider: event.provider,
				turnId,
				type: event.type
			}
	}
}

function mergeAuthorizedToolContext(
	context: ToolExecutionContext,
	authorization: ToolAuthorizationContext
): ToolExecutionContext {
	return {
		...context,
		allowedMemoryKinds: authorization.allowedMemoryKinds ?? context.allowedMemoryKinds,
		allowedSkillNames: authorization.allowedSkillNames ?? context.allowedSkillNames,
		fileAccessPolicy: authorization.fileAccessPolicy ?? context.fileAccessPolicy,
		networkAccessPolicy: authorization.networkAccessPolicy ?? context.networkAccessPolicy,
		todoAllowed: authorization.todoAllowed ?? context.todoAllowed
	}
}
