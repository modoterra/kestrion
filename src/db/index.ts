import { Database } from 'bun:sqlite'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { readMigrationFiles } from 'drizzle-orm/migrator'

import { migrateAppDatabase } from '../lib/conversation-store-migrations'
import * as schema from './schema'

export type AppDatabase = BunSQLiteDatabase<typeof schema>
export type AppDatabaseConnection = { client: Database; db: AppDatabase }

export function closeAppDatabaseConnection(connection: AppDatabaseConnection): void {
	connection.client.close()
}

export function openAppDatabaseConnection(databaseFile: string): AppDatabaseConnection {
	const client = new Database(databaseFile, { create: true })
	client.exec('PRAGMA journal_mode = WAL;')
	client.exec('PRAGMA foreign_keys = ON;')

	const db = drizzle(client, { schema })

	migrateAppDatabase(client)
	bootstrapLegacyMigrationState(client)
	runDrizzleMigrations(db)

	return { client, db }
}

function bootstrapLegacyMigrationState(client: Database): void {
	if (!hasMigrationJournal() || !hasLegacyAppSchema(client) || hasRecordedDrizzleMigration(client)) {
		return
	}

	const initialMigration = readMigrationFiles({ migrationsFolder: getMigrationsFolder() })[0]
	if (!initialMigration) {
		return
	}

	client.exec(`
		CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
			id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
			hash TEXT NOT NULL,
			created_at NUMERIC
		);
	`)

	client
		.prepare('INSERT INTO "__drizzle_migrations" ("hash", "created_at") VALUES (?, ?)')
		.run(initialMigration.hash, initialMigration.folderMillis)
}

function getMigrationsFolder(): string {
	return fileURLToPath(new URL('./migrations', import.meta.url))
}

function hasLegacyAppSchema(client: Database): boolean {
	const row = client
		.prepare(
			`SELECT name
			FROM sqlite_master
			WHERE type = 'table' AND name IN ('conversations', 'messages', 'provider_catalog', 'provider_models')
			LIMIT 1`
		)
		.get() as { name: string } | null

	return row !== null
}

function hasMigrationJournal(): boolean {
	return existsSync(fileURLToPath(new URL('./migrations/meta/_journal.json', import.meta.url)))
}

function hasRecordedDrizzleMigration(client: Database): boolean {
	const tableRow = client
		.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'`)
		.get() as { name: string } | null

	if (!tableRow) {
		return false
	}

	const migrationRow = client
		.prepare('SELECT id FROM "__drizzle_migrations" ORDER BY created_at DESC LIMIT 1')
		.get() as { id: number } | null

	return migrationRow !== null
}

function runDrizzleMigrations(db: AppDatabase): void {
	if (!hasMigrationJournal()) {
		return
	}

	migrate(db, { migrationsFolder: getMigrationsFolder() })
}

export { schema }
