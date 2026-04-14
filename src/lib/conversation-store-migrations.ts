import type { Database } from 'bun:sqlite'

import type { ProviderCatalogRecord, ProviderModelRecord } from './types'

const UPSERT_PROVIDER_SQL =
	'INSERT INTO provider_catalog (id, label, description, sort_order) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET label = excluded.label, description = excluded.description, sort_order = excluded.sort_order'
const UPSERT_PROVIDER_MODEL_SQL =
	'INSERT INTO provider_models (id, provider_id, label, description, model_identifier, sort_order) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET provider_id = excluded.provider_id, label = excluded.label, description = excluded.description, model_identifier = excluded.model_identifier, sort_order = excluded.sort_order'

export function applyConversationSchemaMigration(database: Database): void {
	database.exec(`
		CREATE TABLE IF NOT EXISTS conversations (
			id TEXT PRIMARY KEY,
			title TEXT NOT NULL,
			provider TEXT NOT NULL,
			model TEXT NOT NULL,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS messages (
			id TEXT PRIMARY KEY,
			conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
			role TEXT NOT NULL,
			content TEXT NOT NULL,
			provider TEXT,
			model TEXT,
			created_at TEXT NOT NULL
		);

		CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
			ON messages(conversation_id, created_at);

		CREATE INDEX IF NOT EXISTS idx_conversations_updated_at
			ON conversations(updated_at);
	`)
	database.exec('PRAGMA user_version = 1;')
}

export function applyProviderCatalogMigration(database: Database): void {
	database.exec(`
		CREATE TABLE IF NOT EXISTS provider_catalog (
			id TEXT PRIMARY KEY,
			label TEXT NOT NULL,
			description TEXT NOT NULL,
			sort_order INTEGER NOT NULL
		);

		CREATE TABLE IF NOT EXISTS provider_models (
			id TEXT PRIMARY KEY,
			provider_id TEXT NOT NULL REFERENCES provider_catalog(id) ON DELETE CASCADE,
			label TEXT NOT NULL,
			description TEXT NOT NULL,
			model_identifier TEXT NOT NULL,
			sort_order INTEGER NOT NULL
		);

		CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_models_provider_model
			ON provider_models(provider_id, model_identifier);

		CREATE INDEX IF NOT EXISTS idx_provider_models_provider_sort
			ON provider_models(provider_id, sort_order);
	`)
	upsertProviderCatalog(database, MIGRATION_2_PROVIDERS, MIGRATION_2_PROVIDER_MODELS)
	database.exec('PRAGMA user_version = 2;')
}

export function refreshProviderCatalogMigration(database: Database): void {
	upsertProviderCatalog(database, MIGRATION_3_PROVIDERS, MIGRATION_3_PROVIDER_MODELS)
	database.exec('PRAGMA user_version = 3;')
}

export function applyPersistentToolStorageMigration(database: Database): void {
	database.exec(`
		CREATE TABLE IF NOT EXISTS tool_todos (
			id TEXT PRIMARY KEY,
			content TEXT NOT NULL,
			notes TEXT NOT NULL DEFAULT '',
			priority TEXT NOT NULL,
			done INTEGER NOT NULL DEFAULT 0,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);

		CREATE INDEX IF NOT EXISTS idx_tool_todos_done_updated
			ON tool_todos(done, updated_at DESC);

		CREATE TABLE IF NOT EXISTS tool_memory_entries (
			id TEXT PRIMARY KEY,
			kind TEXT NOT NULL,
			title TEXT NOT NULL DEFAULT '',
			content TEXT NOT NULL,
			tags_json TEXT NOT NULL DEFAULT '[]',
			created_at TEXT NOT NULL
		);

		CREATE INDEX IF NOT EXISTS idx_tool_memory_entries_kind_created
			ON tool_memory_entries(kind, created_at DESC);

		CREATE TABLE IF NOT EXISTS tool_scratch_memory (
			id INTEGER PRIMARY KEY CHECK (id = 1),
			content TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);
	`)
	database.exec('PRAGMA user_version = 4;')
}

export function migrateAppDatabase(database: Database): void {
	let version = (database.prepare('PRAGMA user_version').get() as { user_version?: number } | null)?.user_version ?? 0

	if (version < 1) {
		applyConversationSchemaMigration(database)
		version = 1
	}

	if (version < 2) {
		applyProviderCatalogMigration(database)
		version = 2
	}

	if (version < 3) {
		refreshProviderCatalogMigration(database)
		version = 3
	}

	if (version < 4) {
		applyPersistentToolStorageMigration(database)
	}
}

function upsertProviderCatalog(
	database: Database,
	providers: ProviderCatalogRecord[],
	models: ProviderModelRecord[]
): void {
	const upsertProvider = database.prepare(UPSERT_PROVIDER_SQL)
	const upsertProviderModel = database.prepare(UPSERT_PROVIDER_MODEL_SQL)
	const applySeed = database.transaction(() => {
		for (const provider of providers) {
			upsertProvider.run(provider.id, provider.label, provider.description, provider.sortOrder)
		}

		for (const model of models) {
			upsertProviderModel.run(model.id, model.providerId, model.label, model.description, model.model, model.sortOrder)
		}
	})

	applySeed()
}

const MIGRATION_2_PROVIDERS: ProviderCatalogRecord[] = [
	{ description: 'fireworks.ai', id: 'fireworks', label: 'Fireworks', sortOrder: 1 }
]

const MIGRATION_2_PROVIDER_MODELS: ProviderModelRecord[] = [
	{
		description: 'Best default for everyday conversations and general tasks',
		id: 'forerunner-chat',
		label: 'Conversational',
		model: 'accounts/fireworks/models/kimi-k2p5',
		providerId: 'fireworks',
		sortOrder: 1
	},
	{
		description: 'Best for deeper reasoning, planning, and tricky multi-step work',
		id: 'forerunner-thinking',
		label: 'Thinking',
		model: 'accounts/fireworks/models/kimi-k2-thinking',
		providerId: 'fireworks',
		sortOrder: 2
	},
	{
		description: 'Best for screenshots, images, and visual analysis',
		id: 'forerunner-vision',
		label: 'Vision',
		model: 'accounts/fireworks/models/qwen3-vl-30b-a3b-thinking',
		providerId: 'fireworks',
		sortOrder: 3
	},
	{
		description: 'Lower-cost option for lightweight tasks and higher-volume usage',
		id: 'forerunner-budget',
		label: 'Budget',
		model: 'accounts/fireworks/models/deepseek-v3p2',
		providerId: 'fireworks',
		sortOrder: 4
	},
	{
		description: 'Alternate flagship chat model for side-by-side evaluation',
		id: 'forerunner-premium-chat-alt',
		label: 'Premium',
		model: 'accounts/fireworks/models/qwen3p6-plus',
		providerId: 'fireworks',
		sortOrder: 5
	}
]

const MIGRATION_3_PROVIDERS = MIGRATION_2_PROVIDERS
const MIGRATION_3_PROVIDER_MODELS = MIGRATION_2_PROVIDER_MODELS
