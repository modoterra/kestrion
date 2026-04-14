import type { Database } from 'bun:sqlite'
import { randomUUID } from 'node:crypto'

import { openAppDatabase } from './app-database'
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
	private readonly database: Database

	constructor(databaseFile: string) {
		this.database = openAppDatabase(databaseFile)
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

		this.database
			.prepare(
				`INSERT INTO messages (
          id,
          conversation_id,
          role,
          content,
          provider,
          model,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
			)
			.run(
				message.id,
				message.conversationId,
				message.role,
				message.content,
				message.provider,
				message.model,
				message.createdAt
			)

		this.touchConversation(input.conversationId, now)
		return message
	}

	close(): void {
		this.database.close()
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

		this.database
			.prepare(
				`INSERT INTO conversations (
          id,
          title,
          provider,
          model,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)`
			)
			.run(
				conversation.id,
				conversation.title,
				conversation.provider,
				conversation.model,
				conversation.createdAt,
				conversation.updatedAt
			)

		return { conversation, messages: [] }
	}

	deleteAllConversations(): void {
		this.database.prepare('DELETE FROM conversations').run()
	}

	deleteConversation(conversationId: string): void {
		this.database.prepare('DELETE FROM conversations WHERE id = ?').run(conversationId)
	}

	getConversation(conversationId: string): ConversationThread | null {
		const conversationRow = this.database
			.prepare(
				`SELECT
          id,
          title,
          provider,
          model,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM conversations
        WHERE id = ?`
			)
			.get(conversationId) as ConversationRecord | undefined

		if (!conversationRow) {
			return null
		}

		const messageRows = this.database
			.prepare(
				`SELECT
          id,
          conversation_id AS conversationId,
          role,
          content,
          provider,
          model,
          created_at AS createdAt
        FROM messages
        WHERE conversation_id = ?
        ORDER BY created_at ASC, rowid ASC`
			)
			.all(conversationId) as MessageRecord[]

		return { conversation: conversationRow, messages: messageRows }
	}

	listConversations(limit = 50): ConversationSummary[] {
		return this.database
			.prepare(
				`SELECT
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
        LIMIT ?`
			)
			.all(limit) as ConversationSummary[]
	}

	listProviders(): ProviderCatalogRecord[] {
		return this.database
			.prepare(
				`SELECT
          id,
          label,
          description,
          sort_order AS sortOrder
        FROM provider_catalog
        ORDER BY sort_order ASC, label ASC`
			)
			.all() as ProviderCatalogRecord[]
	}

	listProviderModels(providerId: string): ProviderModelRecord[] {
		return this.database
			.prepare(
				`SELECT
          id,
          provider_id AS providerId,
          label,
          description,
          model_identifier AS model,
          sort_order AS sortOrder
        FROM provider_models
        WHERE provider_id = ?
        ORDER BY sort_order ASC, label ASC`
			)
			.all(providerId) as ProviderModelRecord[]
	}

	renameConversation(conversationId: string, title: string): void {
		const now = new Date().toISOString()
		this.database
			.prepare(
				`UPDATE conversations
        SET title = ?, updated_at = ?
        WHERE id = ?`
			)
			.run(title, now, conversationId)
	}
	private touchConversation(conversationId: string, updatedAt: string): void {
		this.database
			.prepare(
				`UPDATE conversations
        SET updated_at = ?
        WHERE id = ?`
			)
			.run(updatedAt, conversationId)
	}
}
