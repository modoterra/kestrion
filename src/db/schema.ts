import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const conversations = sqliteTable(
	'conversations',
	{
		createdAt: text('created_at').notNull(),
		id: text('id').primaryKey(),
		model: text('model').notNull(),
		provider: text('provider').notNull(),
		title: text('title').notNull(),
		updatedAt: text('updated_at').notNull()
	},
	table => [index('idx_conversations_updated_at').on(table.updatedAt)]
)

export const messages = sqliteTable(
	'messages',
	{
		content: text('content').notNull(),
		conversationId: text('conversation_id')
			.notNull()
			.references(() => conversations.id, { onDelete: 'cascade' }),
		createdAt: text('created_at').notNull(),
		id: text('id').primaryKey(),
		model: text('model'),
		provider: text('provider'),
		role: text('role').notNull()
	},
	table => [index('idx_messages_conversation_created').on(table.conversationId, table.createdAt)]
)

export const conversationCompaction = sqliteTable('conversation_compaction', {
	compactedThroughMessageId: text('compacted_through_message_id').notNull(),
	conversationId: text('conversation_id')
		.primaryKey()
		.references(() => conversations.id, { onDelete: 'cascade' }),
	summary: text('summary').notNull(),
	updatedAt: text('updated_at').notNull()
})

export const conversationToolCalls = sqliteTable(
	'conversation_tool_calls',
	{
		conversationId: text('conversation_id')
			.notNull()
			.references(() => conversations.id, { onDelete: 'cascade' }),
		createdAt: text('created_at').notNull(),
		id: text('id').primaryKey(),
		status: text('status').notNull(),
		toolCallsJson: text('tool_calls_json').notNull()
	},
	table => [index('idx_conversation_tool_calls_created').on(table.conversationId, table.createdAt)]
)

export const conversationWorkerTranscript = sqliteTable(
	'conversation_worker_transcript',
	{
		conversationId: text('conversation_id')
			.notNull()
			.references(() => conversations.id, { onDelete: 'cascade' }),
		createdAt: text('created_at').notNull(),
		direction: text('direction').notNull(),
		id: text('id').primaryKey(),
		kind: text('kind').notNull(),
		payloadJson: text('payload_json').notNull(),
		sequence: integer('sequence').notNull(),
		turnId: text('turn_id').notNull()
	},
	table => [
		index('idx_conversation_worker_transcript_created').on(table.conversationId, table.createdAt),
		index('idx_conversation_worker_transcript_turn_sequence').on(table.conversationId, table.turnId, table.sequence)
	]
)

export const providerCatalog = sqliteTable('provider_catalog', {
	description: text('description').notNull(),
	id: text('id').primaryKey(),
	label: text('label').notNull(),
	sortOrder: integer('sort_order').notNull()
})

export const providerModels = sqliteTable(
	'provider_models',
	{
		description: text('description').notNull(),
		id: text('id').primaryKey(),
		label: text('label').notNull(),
		modelIdentifier: text('model_identifier').notNull(),
		providerId: text('provider_id')
			.notNull()
			.references(() => providerCatalog.id, { onDelete: 'cascade' }),
		sortOrder: integer('sort_order').notNull()
	},
	table => [
		uniqueIndex('idx_provider_models_provider_model').on(table.providerId, table.modelIdentifier),
		index('idx_provider_models_provider_sort').on(table.providerId, table.sortOrder)
	]
)

export const toolTodos = sqliteTable(
	'tool_todos',
	{
		content: text('content').notNull(),
		createdAt: text('created_at').notNull(),
		done: integer('done', { mode: 'boolean' }).notNull().default(false),
		id: text('id').primaryKey(),
		notes: text('notes').notNull().default(''),
		priority: text('priority').notNull(),
		updatedAt: text('updated_at').notNull()
	},
	table => [index('idx_tool_todos_done_updated').on(table.done, table.updatedAt)]
)

export const toolMemoryEntries = sqliteTable(
	'tool_memory_entries',
	{
		content: text('content').notNull(),
		createdAt: text('created_at').notNull(),
		id: text('id').primaryKey(),
		integrityState: text('integrity_state').notNull().default('unsigned'),
		kind: text('kind').notNull(),
		lastValidatedAt: text('last_validated_at'),
		originJson: text('origin_json').notNull().default('{}'),
		signature: text('signature').notNull().default(''),
		signerKeyId: text('signer_key_id').notNull().default(''),
		staleAfter: text('stale_after').notNull().default(''),
		tagsJson: text('tags_json').notNull().default('[]'),
		title: text('title').notNull().default('')
	},
	table => [index('idx_tool_memory_entries_kind_created').on(table.kind, table.createdAt)]
)

export const toolScratchMemory = sqliteTable(
	'tool_scratch_memory',
	{
		content: text('content').notNull(),
		createdAt: text('created_at').notNull().default(''),
		id: integer('id').primaryKey(),
		integrityState: text('integrity_state').notNull().default('unsigned'),
		lastValidatedAt: text('last_validated_at'),
		originJson: text('origin_json').notNull().default('{}'),
		signature: text('signature').notNull().default(''),
		signerKeyId: text('signer_key_id').notNull().default(''),
		staleAfter: text('stale_after').notNull().default(''),
		updatedAt: text('updated_at').notNull()
	},
	table => [check('tool_scratch_memory_id_check', sql`${table.id} = 1`)]
)

export const toolPolicy = sqliteTable(
	'tool_policy',
	{
		id: integer('id').primaryKey(),
		policyJson: text('policy_json').notNull(),
		updatedAt: text('updated_at').notNull()
	},
	table => [check('tool_policy_id_check', sql`${table.id} = 1`)]
)
