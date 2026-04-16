import { randomUUID } from 'node:crypto'
/* eslint-disable import/max-dependencies */
import { existsSync, unlinkSync } from 'node:fs'
import { createServer, type AddressInfo, type Server, type Socket } from 'node:net'

import type { ResolvedAppConfig } from '../../config'
import type { AppPaths } from '../../paths'
import { AgentService } from '../../services/agent-service'
import { ConversationStore } from '../../storage/conversation-store'
import type { ToolApprovalPrompt, ToolApprovalResponse } from '../../types'
import type { TurnRunner } from '../worker/turn-runner'
import { DaemonController } from './controller'
import type { DaemonRequest, DaemonResponse, DaemonResponseResult } from './protocol'

export class DaemonServer {
	private readonly inflightApprovalPrompts = new Map<
		string,
		{
			reject: (error: Error) => void
			requestId: string
			resolve: (decision: ToolApprovalResponse) => void
			socket: Socket
		}
	>()
	private readonly controller: DaemonController
	private readonly inflightRequests = new Map<string, AbortController>()
	private readonly store: ConversationStore
	private server: Server | null = null

	constructor(
		private readonly paths: AppPaths,
		config: ResolvedAppConfig,
		runner: TurnRunner,
		private readonly endpoint?: { host?: string; port: number }
	) {
		this.store = new ConversationStore(paths.databaseFile)
		const service = new AgentService(this.store, config)
		this.controller = new DaemonController(this.store, service, paths, runner, config)
	}

	async start(): Promise<void> {
		if (!this.endpoint && existsSync(this.paths.socketFile)) {
			unlinkSync(this.paths.socketFile)
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
	}

	async stop(): Promise<void> {
		for (const controller of this.inflightRequests.values()) {
			controller.abort()
		}
		this.inflightRequests.clear()
		this.rejectAllApprovalPrompts(new Error('Daemon stopped before approval was received.'))

		const server = this.server
		this.server = null
		if (server) {
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

		if (!this.endpoint && existsSync(this.paths.socketFile)) {
			unlinkSync(this.paths.socketFile)
		}

		this.store.close()
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
		let buffer = ''
		socket.setEncoding('utf8')
		socket.on('close', () => {
			this.rejectApprovalPromptsForSocket(socket, new Error('CLI disconnected before approval was received.'))
		})
		socket.on('error', () => {
			this.rejectApprovalPromptsForSocket(socket, new Error('CLI connection failed before approval was received.'))
		})
		socket.on('data', chunk => {
			buffer += chunk
			let newlineIndex = buffer.indexOf('\n')
			while (newlineIndex >= 0) {
				const line = buffer.slice(0, newlineIndex).trim()
				buffer = buffer.slice(newlineIndex + 1)
				if (line) {
					void this.handleMessage(socket, JSON.parse(line) as DaemonRequest)
				}
				newlineIndex = buffer.indexOf('\n')
			}
		})
	}

	private async handleMessage(socket: Socket, message: DaemonRequest): Promise<void> {
		try {
			if (message.type === 'generateAssistantReply') {
				await this.handleGenerateAssistantReply(socket, message.id, message.conversationId)
				return
			}

			const result = await this.resolveRequest(message)
			if (result !== undefined) {
				this.writeMessage(socket, { id: message.id, ok: true, result, type: 'response' })
			}
		} catch (error) {
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
		}
	}

	private async handleGenerateAssistantReply(socket: Socket, requestId: string, conversationId: string): Promise<void> {
		const controller = new AbortController()
		this.inflightRequests.set(requestId, controller)

		try {
			const thread = await this.controller.generateAssistantReply(
				conversationId,
				event => {
					this.writeMessage(socket, { event, id: requestId, type: 'event' })
				},
				controller.signal,
				prompt => this.promptForToolAuthorization(socket, requestId, prompt),
				entry => {
					this.writeMessage(socket, { entry, id: requestId, type: 'transcriptEvent' })
				}
			)
			this.writeMessage(socket, { id: requestId, ok: true, result: thread, type: 'response' })
		} finally {
			this.inflightRequests.delete(requestId)
		}
	}

	private writeMessage(socket: Socket, message: DaemonResponse): void {
		socket.write(`${JSON.stringify(message)}\n`)
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
			this.writeMessage(socket, { id: requestId, prompt: enrichedPrompt, type: 'authorizationPrompt' })
		})
	}

	private resolveToolAuthorizationDecision(approvalId: string, decision: ToolApprovalResponse): void {
		const pendingPrompt = this.inflightApprovalPrompts.get(approvalId)
		if (!pendingPrompt) {
			return
		}

		this.inflightApprovalPrompts.delete(approvalId)
		pendingPrompt.resolve(decision)
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

	private rejectApprovalPromptsForSocket(socket: Socket, error: Error): void {
		for (const [approvalId, prompt] of this.inflightApprovalPrompts.entries()) {
			if (prompt.socket !== socket) {
				continue
			}

			this.inflightApprovalPrompts.delete(approvalId)
			prompt.reject(error)
		}
	}
}

function normalizeAddressHost(address: AddressInfo): string {
	return address.address === '::' ? '127.0.0.1' : address.address
}
