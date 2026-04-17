import type { Database } from 'bun:sqlite'

import type { ProviderCatalogRecord, ProviderModelRecord } from '../types'

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

export function applyCuratedKimiCatalogMigration(database: Database): void {
	upsertProviderCatalog(database, MIGRATION_5_PROVIDERS, MIGRATION_5_PROVIDER_MODELS)
	database.exec('PRAGMA user_version = 5;')
}

export function applyConversationCompactionMigration(database: Database): void {
	database.exec(`
		CREATE TABLE IF NOT EXISTS conversation_compaction (
			conversation_id TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
			compacted_through_message_id TEXT NOT NULL,
			summary TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);
	`)
	database.exec('PRAGMA user_version = 6;')
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
		version = 4
	}

	if (version < 5) {
		applyCuratedKimiCatalogMigration(database)
		version = 5
	}

	if (version < 6) {
		applyConversationCompactionMigration(database)
	}
}

function upsertProviderCatalog(
	database: Database,
	providers: ProviderCatalogRecord[],
	models: ProviderModelRecord[]
): void {
	const upsertProvider = database.prepare(UPSERT_PROVIDER_SQL)
	const upsertProviderModel = database.prepare(UPSERT_PROVIDER_MODEL_SQL)
	const deleteProvider = database.prepare('DELETE FROM provider_catalog WHERE id = ?')
	const deleteProviderModel = database.prepare('DELETE FROM provider_models WHERE id = ?')
	const applySeed = database.transaction(() => {
		const expectedProviderIds = new Set(providers.map(provider => provider.id))
		const expectedModelIds = new Set(models.map(model => model.id))
		const existingProviderIds = database.prepare('SELECT id FROM provider_catalog').all() as Array<{ id: string }>
		const existingModelIds = database.prepare('SELECT id FROM provider_models').all() as Array<{ id: string }>

		for (const existingModel of existingModelIds) {
			if (!expectedModelIds.has(existingModel.id)) {
				deleteProviderModel.run(existingModel.id)
			}
		}

		for (const provider of providers) {
			upsertProvider.run(provider.id, provider.label, provider.description, provider.sortOrder)
		}

		for (const model of models) {
			upsertProviderModel.run(model.id, model.providerId, model.label, model.description, model.model, model.sortOrder)
		}

		for (const existingProvider of existingProviderIds) {
			if (!expectedProviderIds.has(existingProvider.id)) {
				deleteProvider.run(existingProvider.id)
			}
		}
	})

	applySeed()
}

const MIGRATION_2_PROVIDERS: ProviderCatalogRecord[] = [
	{ description: 'fireworks.ai', id: 'fireworks', label: 'Fireworks', sortOrder: 1 }
]

const MIGRATION_2_PROVIDER_MODELS: ProviderModelRecord[] = [
	{
		description: 'Curated Kimi profile with automatic Instant and Thinking mode switching',
		id: 'forerunner-chat',
		label: 'Kimi K2.5',
		model: 'accounts/fireworks/models/kimi-k2p5',
		providerId: 'fireworks',
		sortOrder: 1
	}
]

const MIGRATION_3_PROVIDERS = MIGRATION_2_PROVIDERS
const MIGRATION_3_PROVIDER_MODELS = MIGRATION_2_PROVIDER_MODELS
const MIGRATION_5_PROVIDERS = MIGRATION_2_PROVIDERS
const MIGRATION_5_PROVIDER_MODELS = MIGRATION_2_PROVIDER_MODELS
