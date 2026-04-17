/* eslint-disable max-lines */

import { randomUUID } from 'node:crypto'

import { asc, eq, sql } from 'drizzle-orm'

import {
	conversationCompaction,
	conversationToolCalls,
	conversationWorkerTranscript,
	conversations,
	messages,
	providerCatalog,
	providerModels
} from '../../db/schema'
import type { ToolPolicy } from '../tools/policy'
import type {
	ConversationRecord,
	ConversationCompactionRecord,
	ConversationSummary,
	ConversationThread,
	InferenceToolCall,
	MessageRecord,
	MessageRole,
	ProviderCatalogRecord,
	ProviderModelRecord,
	ToolCallMessageRecord,
	WorkerTranscriptEntry
} from '../types'
import { openAppDatabaseConnectionWithDrizzle, type AppDatabase, type AppDatabaseConnection } from './app-database'
import { loadStoredToolPolicy, saveStoredToolPolicy } from './tool-policy-store'

type AppendMessageInput = {
	content: string
	conversationId: string
	createdAt?: string
	model?: string | null
	provider?: string | null
	role: MessageRole
}

type AppendToolCallMessageInput = {
	conversationId: string
	createdAt?: string
	status?: ToolCallMessageRecord['status']
	toolCalls: InferenceToolCall[]
}

type AppendWorkerTranscriptEntryInput = Omit<WorkerTranscriptEntry, 'id'>
type CreateConversationInput = { model: string; provider: string; title: string }
type SaveConversationCompactionInput = {
	compactedThroughMessageId: string
	conversationId: string
	summary: string
}

export class ConversationStore {
	private readonly client: AppDatabaseConnection['client']
	private readonly database: AppDatabase

	constructor(databaseFile: string) {
		const connection = openAppDatabaseConnectionWithDrizzle(databaseFile)
		this.client = connection.client
		this.database = connection.db
	}

	appendMessage(input: AppendMessageInput): MessageRecord {
		const now = input.createdAt ?? new Date().toISOString()
		const message: MessageRecord = {
			content: input.content,
			conversationId: input.conversationId,
			createdAt: now,
			id: randomUUID(),
			model: input.model ?? null,
			provider: input.provider ?? null,
			role: input.role
		}

		this.database.insert(messages).values(message).run()

		this.touchConversation(input.conversationId, now)
		return message
	}

	appendToolCallMessage(input: AppendToolCallMessageInput): ToolCallMessageRecord {
		const now = input.createdAt ?? new Date().toISOString()
		const message: ToolCallMessageRecord = {
			conversationId: input.conversationId,
			createdAt: now,
			id: randomUUID(),
			status: input.status ?? 'running',
			toolCalls: input.toolCalls
		}

		this.database
			.insert(conversationToolCalls)
			.values({
				conversationId: message.conversationId,
				createdAt: message.createdAt,
				id: message.id,
				status: message.status,
				toolCallsJson: JSON.stringify(message.toolCalls)
			})
			.run()

		this.touchConversation(input.conversationId, now)
		return message
	}

	appendWorkerTranscriptEntry(input: AppendWorkerTranscriptEntryInput): WorkerTranscriptEntry {
		const entry: WorkerTranscriptEntry = { ...input, id: randomUUID() }

		this.database.insert(conversationWorkerTranscript).values(entry).run()

		return entry
	}

	close(): void {
		this.client.close()
	}

	createConversation(input: CreateConversationInput): ConversationThread {
		const now = new Date().toISOString()
		const conversation: ConversationRecord = {
			createdAt: now,
			id: randomUUID(),
			model: input.model,
			provider: input.provider,
			title: input.title,
			updatedAt: now
		}

		this.database.insert(conversations).values(conversation).run()

		return { compaction: null, conversation, messages: [], toolCallMessages: [] }
	}

	deleteAllConversations(): void {
		this.database.delete(conversations).run()
	}

	deleteConversation(conversationId: string): void {
		this.database.delete(conversations).where(eq(conversations.id, conversationId)).run()
	}

	getConversation(conversationId: string): ConversationThread | null {
		const conversationRow = this.getConversationRow(conversationId)

		if (!conversationRow) {
			return null
		}

		return {
			compaction: this.getConversationCompaction(conversationId),
			conversation: conversationRow,
			messages: this.getConversationMessages(conversationId),
			toolCallMessages: this.getConversationToolCallMessages(conversationId)
		}
	}

	getConversationCompaction(conversationId: string): ConversationCompactionRecord | null {
		const row = this.database
			.select({
				compactedThroughMessageId: conversationCompaction.compactedThroughMessageId,
				conversationId: conversationCompaction.conversationId,
				summary: conversationCompaction.summary,
				updatedAt: conversationCompaction.updatedAt
			})
			.from(conversationCompaction)
			.where(eq(conversationCompaction.conversationId, conversationId))
			.get() as ConversationCompactionRecord | undefined

		return row ?? null
	}

	listConversations(limit = 50): ConversationSummary[] {
		return this.database.all<ConversationSummary>(sql`
			SELECT
				c.id,
				c.title,
				c.provider,
				c.model,
				c.created_at AS createdAt,
				c.updated_at AS updatedAt,
				COUNT(m.id) AS messageCount,
				(
					SELECT latest.content
					FROM messages latest
					WHERE latest.conversation_id = c.id
					ORDER BY latest.created_at DESC, latest.rowid DESC
					LIMIT 1
				) AS preview
			FROM conversations c
			LEFT JOIN messages m
				ON m.conversation_id = c.id
			GROUP BY c.id
			ORDER BY c.updated_at DESC
			LIMIT ${limit}
		`)
	}

	loadToolPolicy(): ToolPolicy {
		return loadStoredToolPolicy(this.database)
	}

	listConversationWorkerTranscript(conversationId: string): WorkerTranscriptEntry[] {
		return this.database
			.select({
				conversationId: conversationWorkerTranscript.conversationId,
				createdAt: conversationWorkerTranscript.createdAt,
				direction: conversationWorkerTranscript.direction,
				id: conversationWorkerTranscript.id,
				kind: conversationWorkerTranscript.kind,
				payloadJson: conversationWorkerTranscript.payloadJson,
				sequence: conversationWorkerTranscript.sequence,
				turnId: conversationWorkerTranscript.turnId
			})
			.from(conversationWorkerTranscript)
			.where(eq(conversationWorkerTranscript.conversationId, conversationId))
			.orderBy(asc(conversationWorkerTranscript.createdAt), asc(conversationWorkerTranscript.sequence), sql`rowid asc`)
			.all() as WorkerTranscriptEntry[]
	}

	listProviders(): ProviderCatalogRecord[] {
		return this.database
			.select({
				description: providerCatalog.description,
				id: providerCatalog.id,
				label: providerCatalog.label,
				sortOrder: providerCatalog.sortOrder
			})
			.from(providerCatalog)
			.orderBy(asc(providerCatalog.sortOrder), asc(providerCatalog.label))
			.all() as ProviderCatalogRecord[]
	}

	listProviderModels(providerId: string): ProviderModelRecord[] {
		return this.database
			.select({
				description: providerModels.description,
				id: providerModels.id,
				label: providerModels.label,
				model: providerModels.modelIdentifier,
				providerId: providerModels.providerId,
				sortOrder: providerModels.sortOrder
			})
			.from(providerModels)
			.where(eq(providerModels.providerId, providerId))
			.orderBy(asc(providerModels.sortOrder), asc(providerModels.label))
			.all() as ProviderModelRecord[]
	}

	renameConversation(conversationId: string, title: string): void {
		const now = new Date().toISOString()
		this.database.update(conversations).set({ title, updatedAt: now }).where(eq(conversations.id, conversationId)).run()
	}

	updateConversationInference(conversationId: string, provider: string, model: string): void {
		const now = new Date().toISOString()
		this.database
			.update(conversations)
			.set({ model, provider, updatedAt: now })
			.where(eq(conversations.id, conversationId))
			.run()
	}

	markToolCallMessageCompleted(toolCallMessageId: string): void {
		this.database
			.update(conversationToolCalls)
			.set({ status: 'completed' })
			.where(eq(conversationToolCalls.id, toolCallMessageId))
			.run()
	}

	deleteConversationCompaction(conversationId: string): void {
		this.database.delete(conversationCompaction).where(eq(conversationCompaction.conversationId, conversationId)).run()
	}

	saveConversationCompaction(input: SaveConversationCompactionInput): ConversationCompactionRecord {
		const updatedAt = new Date().toISOString()
		const record: ConversationCompactionRecord = {
			compactedThroughMessageId: input.compactedThroughMessageId,
			conversationId: input.conversationId,
			summary: input.summary,
			updatedAt
		}

		this.database
			.insert(conversationCompaction)
			.values(record)
			.onConflictDoUpdate({
				set: {
					compactedThroughMessageId: record.compactedThroughMessageId,
					summary: record.summary,
					updatedAt: record.updatedAt
				},
				target: conversationCompaction.conversationId
			})
			.run()

		return record
	}

	saveToolPolicy(policy: ToolPolicy): ToolPolicy {
		return saveStoredToolPolicy(this.database, policy)
	}

	private touchConversation(conversationId: string, updatedAt: string): void {
		this.database.update(conversations).set({ updatedAt }).where(eq(conversations.id, conversationId)).run()
	}

	private getConversationMessages(conversationId: string): MessageRecord[] {
		return this.database
			.select({
				content: messages.content,
				conversationId: messages.conversationId,
				createdAt: messages.createdAt,
				id: messages.id,
				model: messages.model,
				provider: messages.provider,
				role: messages.role
			})
			.from(messages)
			.where(eq(messages.conversationId, conversationId))
			.orderBy(asc(messages.createdAt), sql`rowid asc`)
			.all() as MessageRecord[]
	}

	private getConversationRow(conversationId: string): ConversationRecord | undefined {
		return this.database
			.select({
				createdAt: conversations.createdAt,
				id: conversations.id,
				model: conversations.model,
				provider: conversations.provider,
				title: conversations.title,
				updatedAt: conversations.updatedAt
			})
			.from(conversations)
			.where(eq(conversations.id, conversationId))
			.get() as ConversationRecord | undefined
	}

	private getConversationToolCallMessages(conversationId: string): ToolCallMessageRecord[] {
		return this.database
			.select({
				conversationId: conversationToolCalls.conversationId,
				createdAt: conversationToolCalls.createdAt,
				id: conversationToolCalls.id,
				status: conversationToolCalls.status,
				toolCallsJson: conversationToolCalls.toolCallsJson
			})
			.from(conversationToolCalls)
			.where(eq(conversationToolCalls.conversationId, conversationId))
			.orderBy(asc(conversationToolCalls.createdAt), sql`rowid asc`)
			.all()
			.map(row => ({
				conversationId: row.conversationId,
				createdAt: row.createdAt,
				id: row.id,
				status: row.status as ToolCallMessageRecord['status'],
				toolCalls: JSON.parse(row.toolCallsJson) as InferenceToolCall[]
			}))
	}
}
