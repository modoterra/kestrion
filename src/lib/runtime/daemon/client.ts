/* eslint-disable max-lines */

import { randomUUID } from 'node:crypto'
import type { Socket } from 'node:net'

import type { ResolvedAppConfig } from '../../config'
import type { AppPaths } from '../../paths'
import type { AppService } from '../../services/app-service'
import type {
	ConversationSummary,
	ConversationThread,
	InferenceEvents,
	ProviderModelRecord,
	ToolApprovalPrompt,
	ToolApprovalResponse,
	WorkerTranscriptEntry
} from '../../types'
import type { WorkerTurnEvent } from '../worker/types'
import { connectSocket, requestDaemon } from './client-transport'
import type { DaemonBootstrapResult, DaemonRequest, DaemonResponse, DaemonResponseResult } from './protocol'

type PendingRequest = {
	events?: InferenceEvents
	reject: (error: unknown) => void
	resolve: (value: DaemonResponseResult) => void
}

export class DaemonClient implements AppService {
	private readonly pendingRequests = new Map<string, PendingRequest>()
	private readonly threadCache = new Map<string, ConversationThread>()
	private readonly transcriptCache = new Map<string, WorkerTranscriptEntry[]>()
	private config: DaemonBootstrapResult['config']
	private conversations: ConversationSummary[]
	private fireworksModels: ProviderModelRecord[]

	private constructor(
		private readonly socket: Socket,
		bootstrap: DaemonBootstrapResult
	) {
		this.config = bootstrap.config
		this.conversations = bootstrap.conversations
		this.fireworksModels = bootstrap.fireworksModels
		this.threadCache.set(bootstrap.thread.conversation.id, bootstrap.thread)
	}

	static async connect(
		paths: AppPaths,
		endpoint?: { host?: string; port: number }
	): Promise<{ bootstrap: DaemonBootstrapResult; client: DaemonClient }> {
		const socket = await connectSocket(paths.socketFile, endpoint)
		const bootstrap = (await requestDaemon<DaemonBootstrapResult>(socket, {
			id: randomUUID(),
			type: 'bootstrap'
		})) as DaemonBootstrapResult
		const client = new DaemonClient(socket, bootstrap)
		client.startListening()
		return { bootstrap, client }
	}

	addUserMessage(conversationId: string, content: string): Promise<ConversationThread> {
		return this.request<ConversationThread>({ content, conversationId, id: randomUUID(), type: 'addUserMessage' }).then(
			thread => {
				this.threadCache.set(thread.conversation.id, thread)
				return this.refreshConversations().then(() => thread)
			}
		)
	}

	createDraftConversation(): ConversationThread {
		const now = new Date().toISOString()
		return {
			conversation: {
				createdAt: now,
				id: 'draft',
				model: this.config.providers.fireworks.model,
				provider: this.config.defaultProvider,
				title: 'Fresh session',
				updatedAt: now
			},
			messages: [],
			toolCallMessages: []
		}
	}

	async deleteAllConversations(): Promise<void> {
		await this.request<null>({ id: randomUUID(), type: 'deleteAllConversations' })
		this.conversations = []
		this.threadCache.clear()
		this.transcriptCache.clear()
	}

	deleteConversation(conversationId: string): Promise<void> {
		return this.request<null>({ conversationId, id: randomUUID(), type: 'deleteConversation' }).then(() => {
			this.threadCache.delete(conversationId)
			this.transcriptCache.delete(conversationId)
			return this.refreshConversations()
		})
	}

	generateAssistantReply(
		conversationId: string,
		signal?: AbortSignal,
		events?: InferenceEvents,
		_toolContext?: Parameters<AppService['generateAssistantReply']>[3]
	): Promise<ConversationThread> {
		const requestId = randomUUID()
		const promise = this.request<ConversationThread>(
			{ conversationId, id: requestId, type: 'generateAssistantReply' },
			events
		).then(thread => {
			this.threadCache.set(thread.conversation.id, thread)
			return this.refreshConversations().then(() => thread)
		})

		if (signal) {
			signal.addEventListener(
				'abort',
				() => {
					void this.request<null>({ id: randomUUID(), requestId, type: 'cancelTurn' })
				},
				{ once: true }
			)
		}

		return promise
	}

	getStartupThread(conversations = this.conversations): Promise<ConversationThread> {
		const latestConversation = conversations[0]
		return latestConversation
			? this.loadConversation(latestConversation.id)
			: Promise.resolve(this.createDraftConversation())
	}

	close(): void {
		this.socket.end()
		this.socket.destroy()
	}

	listConversations(): Promise<ConversationSummary[]> {
		return Promise.resolve(this.conversations)
	}

	listProviderModels(providerId: string): Promise<ProviderModelRecord[]> {
		if (providerId === 'fireworks') {
			return Promise.resolve(this.fireworksModels)
		}

		return this.request<ProviderModelRecord[]>({ id: randomUUID(), providerId, type: 'listProviderModels' })
	}

	loadConversation(conversationId: string): Promise<ConversationThread> {
		const cachedThread = this.threadCache.get(conversationId)
		if (cachedThread) {
			return Promise.resolve(cachedThread)
		}

		return this.request<ConversationThread>({ conversationId, id: randomUUID(), type: 'loadConversation' }).then(
			thread => {
				this.threadCache.set(conversationId, thread)
				return thread
			}
		)
	}

	loadConversationWorkerTranscript(conversationId: string): Promise<WorkerTranscriptEntry[]> {
		if (conversationId === 'draft') {
			return Promise.resolve([])
		}

		const cachedEntries = this.transcriptCache.get(conversationId)
		if (cachedEntries) {
			return Promise.resolve(cachedEntries)
		}

		return this.request<WorkerTranscriptEntry[]>({
			conversationId,
			id: randomUUID(),
			type: 'loadConversationWorkerTranscript'
		}).then(entries => {
			const mergedEntries = mergeTranscriptEntries(this.transcriptCache.get(conversationId) ?? [], entries)
			this.transcriptCache.set(conversationId, mergedEntries)
			return mergedEntries
		})
	}

	loadMemorySnapshot(): Promise<Awaited<ReturnType<AppService['loadMemorySnapshot']>>> {
		return this.request<Awaited<ReturnType<AppService['loadMemorySnapshot']>>>({
			id: randomUUID(),
			type: 'loadMemorySnapshot'
		})
	}

	async updateConfig(config: ResolvedAppConfig): Promise<void> {
		await this.request<null>({ config, id: randomUUID(), type: 'updateConfig' })
		this.config = config
	}

	private request<TResult>(message: DaemonRequest, events?: InferenceEvents): Promise<TResult> {
		return new Promise<TResult>((resolve, reject) => {
			this.pendingRequests.set(message.id, { events, reject, resolve: value => resolve(value as TResult) })
			this.socket.write(`${JSON.stringify(message)}\n`)
		})
	}

	private async refreshConversations(): Promise<void> {
		this.conversations = await this.request<ConversationSummary[]>({ id: randomUUID(), type: 'listConversations' })
	}

	private startListening(): void {
		let buffer = ''
		this.socket.setEncoding('utf8')
		this.socket.on('data', chunk => {
			buffer += chunk
			let newlineIndex = buffer.indexOf('\n')
			while (newlineIndex >= 0) {
				const line = buffer.slice(0, newlineIndex).trim()
				buffer = buffer.slice(newlineIndex + 1)
				if (line) {
					this.handleMessage(JSON.parse(line) as DaemonResponse)
				}
				newlineIndex = buffer.indexOf('\n')
			}
		})
	}

	private handleMessage(message: DaemonResponse): void {
		const pendingRequest = this.pendingRequests.get(message.id)
		if (!pendingRequest) {
			return
		}

		if (message.type === 'event') {
			forwardWorkerEvent(message.event, pendingRequest.events)
			return
		}

		if (message.type === 'transcriptEvent') {
			this.pushTranscriptEntry(message.entry)
			pendingRequest.events?.onWorkerTranscriptEntry?.(message.entry)
			return
		}

		if (message.type === 'authorizationPrompt') {
			void this.handleToolAuthorizationPrompt(message.id, message.prompt, pendingRequest.events)
			return
		}

		this.pendingRequests.delete(message.id)
		if (!message.ok) {
			pendingRequest.reject(new Error(message.error))
			return
		}

		pendingRequest.resolve(message.result)
	}

	private pushTranscriptEntry(entry: WorkerTranscriptEntry): void {
		const currentEntries = this.transcriptCache.get(entry.conversationId) ?? []
		this.transcriptCache.set(entry.conversationId, mergeTranscriptEntries(currentEntries, [entry]))
	}

	private async handleToolAuthorizationPrompt(
		requestId: string,
		prompt: ToolApprovalPrompt,
		events: InferenceEvents | undefined
	): Promise<void> {
		const decision = await resolveToolApprovalResponse(events, prompt)
		await this.request<null>({
			approvalId: prompt.approvalId,
			decision,
			id: randomUUID(),
			requestId,
			type: 'toolAuthorizationDecision'
		})
	}
}

function forwardWorkerEvent(event: WorkerTurnEvent, events: InferenceEvents | undefined): void {
	switch (event.type) {
		case 'textDelta':
			events?.onTextDelta?.(event.delta)
			return
		case 'toolCallsStart':
			events?.onToolCallsStart?.(event.toolCalls)
			return
		case 'toolCallsFinish':
			events?.onToolCallsFinish?.(event.toolCalls)
			return
		case 'mutation':
		case 'completed':
			break
	}
}

function mergeTranscriptEntries(
	current: WorkerTranscriptEntry[],
	next: WorkerTranscriptEntry[]
): WorkerTranscriptEntry[] {
	const merged = new Map<string, WorkerTranscriptEntry>()
	for (const entry of current) {
		merged.set(entry.id, entry)
	}
	for (const entry of next) {
		merged.set(entry.id, entry)
	}

	return [...merged.values()].toSorted(compareTranscriptEntries)
}

function compareTranscriptEntries(left: WorkerTranscriptEntry, right: WorkerTranscriptEntry): number {
	return (
		left.createdAt.localeCompare(right.createdAt) || left.sequence - right.sequence || left.id.localeCompare(right.id)
	)
}

async function resolveToolApprovalResponse(
	events: InferenceEvents | undefined,
	prompt: ToolApprovalPrompt
): Promise<ToolApprovalResponse> {
	if (!events?.onToolApprovalPrompt) {
		return { mode: 'deny' }
	}

	try {
		return await events.onToolApprovalPrompt(prompt)
	} catch (error) {
		return { explanation: error instanceof Error ? error.message : 'Approval prompt failed.', mode: 'deny' }
	}
}
