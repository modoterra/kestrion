import { randomUUID } from 'node:crypto'

import { asc, eq, sql } from 'drizzle-orm'

import { conversations, messages, providerCatalog, providerModels } from '../db/schema'
import { openAppDatabaseConnectionWithDrizzle, type AppDatabase, type AppDatabaseConnection } from './app-database'
import type {
	ConversationRecord,
	ConversationSummary,
	ConversationThread,
	MessageRecord,
	MessageRole,
	ProviderCatalogRecord,
	ProviderModelRecord
} from './types'

type AppendMessageInput = {
	content: string
	conversationId: string
	model?: string | null
	provider?: string | null
	role: MessageRole
}

type CreateConversationInput = { model: string; provider: string; title: string }

export class ConversationStore {
	private readonly client: AppDatabaseConnection['client']
	private readonly database: AppDatabase

	constructor(databaseFile: string) {
		const connection = openAppDatabaseConnectionWithDrizzle(databaseFile)
		this.client = connection.client
		this.database = connection.db
	}

	appendMessage(input: AppendMessageInput): MessageRecord {
		const now = new Date().toISOString()
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

		return { conversation, messages: [] }
	}

	deleteAllConversations(): void {
		this.database.delete(conversations).run()
	}

	deleteConversation(conversationId: string): void {
		this.database.delete(conversations).where(eq(conversations.id, conversationId)).run()
	}

	getConversation(conversationId: string): ConversationThread | null {
		const conversationRow = this.database
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

		if (!conversationRow) {
			return null
		}

		const messageRows = this.database
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

		return { conversation: conversationRow, messages: messageRows }
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

	private touchConversation(conversationId: string, updatedAt: string): void {
		this.database.update(conversations).set({ updatedAt }).where(eq(conversations.id, conversationId)).run()
	}
}
