/* eslint-disable max-lines */

import { randomUUID } from 'node:crypto'
/* eslint-disable import/max-dependencies */
import { existsSync, unlinkSync } from 'node:fs'
import { createConnection, createServer, type AddressInfo, type Server, type Socket } from 'node:net'

import type { ResolvedAppConfig } from '../../config'
import type { AppPaths } from '../../paths'
import { AgentService } from '../../services/agent-service'
import { ConversationStore } from '../../storage/conversation-store'
import type { ToolQuestionAnswer, ToolQuestionPrompt } from '../../tools/tool-types'
import type { ToolApprovalPrompt, ToolApprovalResponse } from '../../types'
import { decodeDaemonRequest, encodeDaemonResponse } from '../ipc/daemon-codec'
import { FramedMessageReader, writeFramedMessage } from '../ipc/framing'
import type { TurnRunner } from '../worker/turn-runner'
import type { WorkerTurnEvent } from '../worker/types'
import { DaemonController } from './controller'
import { createDaemonLogger, type DaemonLogger } from './logger'
import type { DaemonRequest, DaemonResponse, DaemonResponseResult } from './protocol'

export class DaemonServer {
	private readonly connectedSockets = new Set<Socket>()
	private readonly inflightApprovalPrompts = new Map<
		string,
		{
			reject: (error: Error) => void
			requestId: string
			resolve: (decision: ToolApprovalResponse) => void
			socket: Socket
		}
	>()
	private readonly inflightQuestionPrompts = new Map<
		string,
		{ reject: (error: Error) => void; requestId: string; resolve: (answer: ToolQuestionAnswer) => void; socket: Socket }
	>()
	private readonly controller: DaemonController
	private readonly inflightRequests = new Map<string, AbortController>()
	private readonly logger: DaemonLogger
	private readonly store: ConversationStore
	private server: Server | null = null

	constructor(
		private readonly paths: AppPaths,
		config: ResolvedAppConfig,
		runner: TurnRunner,
		private readonly endpoint?: { host?: string; port: number },
		options?: { logToStdout?: boolean }
	) {
		this.logger = createDaemonLogger(paths.daemonLogFile, 'daemon', {
			stdout: options?.logToStdout
		}).child('server')
		this.store = new ConversationStore(paths.databaseFile)
		const service = new AgentService(this.store, config, this.logger.child('agent_service'))
		this.controller = new DaemonController(this.store, service, paths, runner, config, this.logger.child('controller'))
	}

	async start(): Promise<void> {
		this.logger.info('server.starting', {
			endpoint: this.endpoint ? `${this.endpoint.host ?? '127.0.0.1'}:${this.endpoint.port}` : this.paths.socketFile
		})
		if (!this.endpoint && existsSync(this.paths.socketFile)) {
			await prepareSocketFile(this.paths.socketFile)
		}

		this.server = createServer(socket => {
			this.handleSocket(socket)
		})

		await new Promise<void>((resolve, reject) => {
			this.server?.once('error', reject)
			this.server?.listen(this.endpoint ?? this.paths.socketFile, () => {
				this.server?.off('error', reject)
				resolve()
			})
		})
		this.logger.info('server.started', {
			endpoint: this.endpoint ? `${this.endpoint.host ?? '127.0.0.1'}:${this.endpoint.port}` : this.paths.socketFile,
			logFile: this.paths.daemonLogFile
		})
	}

	async stop(): Promise<void> {
		this.logger.info('server.stopping', {
			inflightApprovals: this.inflightApprovalPrompts.size,
			inflightQuestions: this.inflightQuestionPrompts.size,
			inflightRequests: this.inflightRequests.size
		})
		for (const controller of this.inflightRequests.values()) {
			controller.abort()
		}
		this.inflightRequests.clear()
		this.rejectAllApprovalPrompts(new Error('Daemon stopped before approval was received.'))
		this.rejectAllQuestionPrompts(new Error('Daemon stopped before a question answer was received.'))

		const server = this.server
		this.server = null
		if (server) {
			for (const socket of this.connectedSockets) {
				socket.destroy()
			}
			this.connectedSockets.clear()

			if (server.listening) {
				await new Promise<void>((resolve, reject) => {
					server.close(error => {
						if (error) {
							reject(error)
							return
						}

						resolve()
					})
				})
			}
		}

		if (!this.endpoint && existsSync(this.paths.socketFile)) {
			try {
				unlinkSync(this.paths.socketFile)
			} catch (error) {
				if (!isFileMissingError(error)) {
					throw error
				}
			}
		}

		this.store.close()
		this.logger.info('server.stopped')
	}

	getEndpoint(): { host?: string; port: number } | null {
		if (!this.endpoint) {
			return null
		}

		const address = this.server?.address()
		if (!address || typeof address === 'string') {
			return null
		}

		return { host: normalizeAddressHost(address), port: address.port }
	}

	private handleSocket(socket: Socket): void {
		this.connectedSockets.add(socket)
		this.logger.info('socket.connected', { activeSockets: this.connectedSockets.size })
		const reader = new FramedMessageReader()
		socket.on('close', () => {
			this.connectedSockets.delete(socket)
			this.logger.info('socket.closed', { activeSockets: this.connectedSockets.size })
			this.rejectApprovalPromptsForSocket(socket, new Error('CLI disconnected before approval was received.'))
			this.rejectQuestionPromptsForSocket(socket, new Error('CLI disconnected before a question answer was received.'))
		})
		socket.on('error', () => {
			this.logger.warn('socket.error')
			this.rejectApprovalPromptsForSocket(socket, new Error('CLI connection failed before approval was received.'))
			this.rejectQuestionPromptsForSocket(
				socket,
				new Error('CLI connection failed before a question answer was received.')
			)
		})
		socket.on('data', chunk => {
			try {
				reader.push(chunk as Buffer, payload => {
					try {
						void this.handleMessage(socket, decodeDaemonRequest(payload) as DaemonRequest)
					} catch (error) {
						this.logger.error('request.malformed', {
							error: error instanceof Error ? error.message : String(error),
							payloadBytes: payload.length
						})
						process.stderr.write(formatMalformedRequestError(error, payload))
						socket.destroy()
					}
				})
			} catch (error) {
				this.logger.error('request.frame_error', {
					error: error instanceof Error ? error.message : String(error),
					payloadBytes: chunk.length
				})
				process.stderr.write(formatMalformedRequestError(error, chunk))
				socket.destroy()
			}
		})
	}

	private async handleMessage(socket: Socket, message: DaemonRequest): Promise<void> {
		this.logger.info('request.received', summarizeDaemonRequest(message))
		try {
			if (message.type === 'generateAssistantReply') {
				await this.handleGenerateAssistantReply(socket, message.id, message.conversationId)
				return
			}

			const result = await this.resolveRequest(message)
			if (result !== undefined) {
				this.logger.info('request.completed', summarizeDaemonResponse(message, result))
				this.writeMessage(socket, { id: message.id, ok: true, result, type: 'response' })
			}
		} catch (error) {
			this.logger.error('request.failed', {
				error: error instanceof Error ? error.message : 'Unknown daemon error.',
				requestId: message.id,
				type: message.type
			})
			this.writeMessage(socket, {
				error: error instanceof Error ? error.message : 'Unknown daemon error.',
				id: message.id,
				ok: false,
				type: 'response'
			})
		}
	}

	private async resolveRequest(
		message: Exclude<DaemonRequest, { type: 'generateAssistantReply' }>
	): Promise<DaemonResponseResult> {
			switch (message.type) {
				case 'bootstrap':
					return this.controller.bootstrap()
				case 'addUserMessage':
					return this.controller.addUserMessage(message.conversationId, message.content)
				case 'callMcpTool':
					return this.controller.callMcpTool(message.toolName, message.argumentsJson)
				case 'compactConversation':
					return this.controller.compactConversation(message.conversationId)
				case 'deleteAllConversations':
					await this.controller.deleteAllConversations()
					return null
			case 'deleteConversation':
				await this.controller.deleteConversation(message.conversationId)
				return null
			case 'loadConversation':
				return this.controller.loadConversation(message.conversationId)
			case 'loadConversationWorkerTranscript':
				return this.controller.loadConversationWorkerTranscript(message.conversationId)
			case 'listConversations':
				return this.controller.listConversations(message.limit)
			case 'listMcpTools':
				return this.controller.listMcpTools()
			case 'listProviderModels':
				return this.controller.listProviderModels(message.providerId)
			case 'loadMemorySnapshot':
				return this.controller.loadMemorySnapshot()
			case 'updateConfig':
				await this.controller.updateConfig(message.config)
				return null
			case 'cancelTurn':
				this.inflightRequests.get(message.requestId)?.abort()
				return null
			case 'toolAuthorizationDecision':
				this.resolveToolAuthorizationDecision(message.approvalId, message.decision)
				return null
			case 'questionResponse':
				this.resolveQuestionResponse(message.promptId, message.answer)
				return null
		}
	}

	private async handleGenerateAssistantReply(socket: Socket, requestId: string, conversationId: string): Promise<void> {
		const controller = new AbortController()
		this.inflightRequests.set(requestId, controller)
		this.logger.info('request.turn.start', { conversationId, requestId, type: 'generateAssistantReply' })

		try {
			const thread = await this.controller.generateAssistantReply(
				conversationId,
				event => {
					this.logger.debug('request.turn.event', summarizeTurnStreamEvent(conversationId, requestId, event))
					this.writeMessage(socket, { event, id: requestId, type: 'event' })
				},
				controller.signal,
				prompt => this.promptForToolAuthorization(socket, requestId, prompt),
				prompt => this.promptForToolQuestion(socket, requestId, prompt),
				entry => {
					this.logger.debug('request.turn.transcript', {
						conversationId,
						direction: entry.direction,
						kind: entry.kind,
						requestId,
						sequence: entry.sequence,
						turnId: entry.turnId
					})
					this.writeMessage(socket, { entry, id: requestId, type: 'transcriptEvent' })
				}
			)
			this.logger.info('request.turn.completed', {
				conversationId,
				messageCount: thread.messages.length,
				requestId
			})
			this.writeMessage(socket, { id: requestId, ok: true, result: thread, type: 'response' })
		} finally {
			this.inflightRequests.delete(requestId)
		}
	}

	private writeMessage(socket: Socket, message: DaemonResponse): void {
		writeFramedMessage(socket, encodeDaemonResponse(message))
	}

	private promptForToolAuthorization(
		socket: Socket,
		requestId: string,
		prompt: ToolApprovalPrompt
	): Promise<ToolApprovalResponse> {
		const approvalId = prompt.approvalId || randomUUID()
		const enrichedPrompt = { ...prompt, approvalId }
		return new Promise<ToolApprovalResponse>((resolve, reject) => {
			this.inflightApprovalPrompts.set(approvalId, { reject, requestId, resolve, socket })
			this.logger.info('request.turn.authorization_prompt', {
				approvalId,
				requestId,
				toolName: enrichedPrompt.toolName
			})
			this.writeMessage(socket, { id: requestId, prompt: enrichedPrompt, type: 'authorizationPrompt' })
		})
	}

	private resolveToolAuthorizationDecision(approvalId: string, decision: ToolApprovalResponse): void {
		const pendingPrompt = this.inflightApprovalPrompts.get(approvalId)
		if (!pendingPrompt) {
			return
		}

		this.inflightApprovalPrompts.delete(approvalId)
		this.logger.info('request.turn.authorization_decision', {
			approvalId,
			mode: decision.mode,
			requestId: pendingPrompt.requestId
		})
		pendingPrompt.resolve(decision)
	}

	private promptForToolQuestion(
		socket: Socket,
		requestId: string,
		prompt: ToolQuestionPrompt
	): Promise<ToolQuestionAnswer> {
		const promptId = randomUUID()
		return new Promise<ToolQuestionAnswer>((resolve, reject) => {
			this.inflightQuestionPrompts.set(promptId, { reject, requestId, resolve, socket })
			this.logger.info('request.turn.question_prompt', { promptId, requestId })
			this.writeMessage(socket, { id: requestId, prompt, promptId, type: 'questionPrompt' })
		})
	}

	private resolveQuestionResponse(promptId: string, answer: ToolQuestionAnswer): void {
		const pendingPrompt = this.inflightQuestionPrompts.get(promptId)
		if (!pendingPrompt) {
			return
		}

		this.inflightQuestionPrompts.delete(promptId)
		this.logger.info('request.turn.question_answer', {
			cancelled: answer.cancelled,
			promptId,
			requestId: pendingPrompt.requestId,
			source: answer.source
		})
		pendingPrompt.resolve(answer)
	}

	private rejectAllApprovalPrompts(error: Error): void {
		for (const approvalId of this.inflightApprovalPrompts.keys()) {
			const prompt = this.inflightApprovalPrompts.get(approvalId)
			if (!prompt) {
				continue
			}

			this.inflightApprovalPrompts.delete(approvalId)
			prompt.reject(error)
		}
	}

	private rejectAllQuestionPrompts(error: Error): void {
		for (const promptId of this.inflightQuestionPrompts.keys()) {
			const prompt = this.inflightQuestionPrompts.get(promptId)
			if (!prompt) {
				continue
			}

			this.inflightQuestionPrompts.delete(promptId)
			prompt.reject(error)
		}
	}

	private rejectApprovalPromptsForSocket(socket: Socket, error: Error): void {
		for (const [approvalId, prompt] of this.inflightApprovalPrompts.entries()) {
			if (prompt.socket !== socket) {
				continue
			}

			this.inflightApprovalPrompts.delete(approvalId)
			prompt.reject(error)
		}
	}

	private rejectQuestionPromptsForSocket(socket: Socket, error: Error): void {
		for (const [promptId, prompt] of this.inflightQuestionPrompts.entries()) {
			if (prompt.socket !== socket) {
				continue
			}

			this.inflightQuestionPrompts.delete(promptId)
			prompt.reject(error)
		}
	}
}

function summarizeDaemonRequest(message: DaemonRequest): Record<string, unknown> {
	switch (message.type) {
		case 'addUserMessage':
			return {
				contentLength: message.content.length,
				conversationId: message.conversationId,
				requestId: message.id,
				type: message.type
			}
		case 'callMcpTool':
			return { requestId: message.id, toolName: message.toolName, type: message.type }
		case 'compactConversation':
		case 'deleteConversation':
		case 'generateAssistantReply':
		case 'loadConversation':
		case 'loadConversationWorkerTranscript':
			return summarizeConversationRequest(message)
		case 'listConversations':
			return { limit: message.limit ?? 50, requestId: message.id, type: message.type }
		case 'listMcpTools':
			return { requestId: message.id, type: message.type }
		case 'listProviderModels':
			return { providerId: message.providerId, requestId: message.id, type: message.type }
		case 'updateConfig':
			return summarizeConfigUpdate(message)
		case 'cancelTurn':
			return { requestId: message.id, targetRequestId: message.requestId, type: message.type }
		case 'toolAuthorizationDecision':
			return summarizeApprovalDecision(message)
		case 'questionResponse':
			return summarizeQuestionResponse(message)
		case 'bootstrap':
		case 'deleteAllConversations':
		case 'loadMemorySnapshot':
			return { requestId: message.id, type: message.type }
	}
}

function summarizeConversationRequest(
	message: Extract<
		DaemonRequest,
		{
			type:
				| 'compactConversation'
				| 'deleteConversation'
				| 'generateAssistantReply'
				| 'loadConversation'
				| 'loadConversationWorkerTranscript'
		}
	>
): Record<string, unknown> {
	return { conversationId: message.conversationId, requestId: message.id, type: message.type }
}

function summarizeConfigUpdate(message: Extract<DaemonRequest, { type: 'updateConfig' }>): Record<string, unknown> {
	return {
		compactAutoPromptChars: message.config.providers.fireworks.compactAutoPromptChars,
		compactAutoTurnThreshold: message.config.providers.fireworks.compactAutoTurnThreshold,
		compactTailTurns: message.config.providers.fireworks.compactTailTurns,
		model: message.config.providers.fireworks.model,
		providerMode: message.config.providers.fireworks.providerMode,
		requestId: message.id,
		type: message.type
	}
}

function summarizeApprovalDecision(
	message: Extract<DaemonRequest, { type: 'toolAuthorizationDecision' }>
): Record<string, unknown> {
	return {
		approvalId: message.approvalId,
		mode: message.decision.mode,
		requestId: message.id,
		targetRequestId: message.requestId,
		type: message.type
	}
}

function summarizeQuestionResponse(
	message: Extract<DaemonRequest, { type: 'questionResponse' }>
): Record<string, unknown> {
	return {
		cancelled: message.answer.cancelled,
		promptId: message.promptId,
		requestId: message.id,
		targetRequestId: message.requestId,
		type: message.type
	}
}

function summarizeDaemonResponse(
	message: Exclude<DaemonRequest, { type: 'generateAssistantReply' }>,
	result: DaemonResponseResult
): Record<string, unknown> {
	return {
		requestId: message.id,
		result: summarizeResponseResult(result),
		type: message.type
	}
}

function summarizeResponseResult(result: DaemonResponseResult): Record<string, unknown> {
	if (result === null) {
		return { kind: 'null' }
	}

	if (Array.isArray(result)) {
		return { count: result.length, kind: 'array' }
	}

	if ('compacted' in result) {
		return {
			compacted: result.compacted,
			conversationId: result.conversationId,
			kind: 'conversationCompactionResult',
			reason: result.reason
		}
	}

	if ('conversation' in result && 'messages' in result) {
		return {
			conversationId: result.conversation.id,
			kind: 'conversationThread',
			messageCount: result.messages.length
		}
	}

	if ('config' in result && 'thread' in result) {
		return {
			conversationCount: result.conversations.length,
			kind: 'bootstrap',
			threadId: result.thread.conversation.id
		}
	}

	return { kind: 'object' }
}

function summarizeTurnStreamEvent(
	conversationId: string,
	requestId: string,
	event: WorkerTurnEvent
): Record<string, unknown> {
	switch (event.type) {
		case 'textDelta':
			return {
				conversationId,
				deltaLength: event.delta.length,
				deltaPreview: event.delta.slice(0, 80),
				requestId,
				type: event.type
			}
		case 'toolCallsStart':
		case 'toolCallsFinish':
			return {
				conversationId,
				requestId,
				toolCallCount: event.toolCalls.length,
				toolNames: event.toolCalls.map(toolCall => toolCall.name),
				type: event.type
			}
		case 'toolAudit':
			return { conversationId, requestId, toolName: event.audit.toolName, type: event.type }
		case 'mutation':
			return { conversationId, mutationType: event.mutation.operation, requestId, type: event.type }
		case 'completed':
			return {
				contentLength: event.content.length,
				conversationId,
				model: event.model,
				provider: event.provider,
				requestId,
				type: event.type
			}
	}
}

export async function prepareSocketFile(socketFile: string): Promise<void> {
	const socketState = await probeUnixSocket(socketFile)
	if (socketState === 'listening') {
		throw new Error(`kestriond is already listening on ${socketFile}.`)
	}

	if (socketState === 'stale') {
		unlinkSync(socketFile)
	}
}

function probeUnixSocket(socketFile: string): Promise<'listening' | 'missing' | 'stale'> {
	return new Promise(resolve => {
		const socket = createConnection(socketFile)
		socket.once('connect', () => {
			socket.destroy()
			resolve('listening')
		})
		socket.once('error', error => {
			socket.destroy()
			resolve(isStaleSocketError(error) ? 'stale' : 'missing')
		})
	})
}

function isFileMissingError(error: unknown): boolean {
	return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function isStaleSocketError(error: unknown): boolean {
	return error instanceof Error && 'code' in error && (error.code === 'ECONNREFUSED' || error.code === 'ENOENT')
}

function normalizeAddressHost(address: AddressInfo): string {
	return address.address === '::' ? '127.0.0.1' : address.address
}

function formatMalformedRequestError(error: unknown, payload: Buffer | Uint8Array): string {
	const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
	const preview = Buffer.from(payload).subarray(0, 32).toString('hex')

	return `Rejected malformed daemon request. This often means the client and daemon are from different builds or protocol versions.\n${message}\nPayload preview (hex): ${preview}\n`
}
