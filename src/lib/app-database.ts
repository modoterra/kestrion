import { Database } from 'bun:sqlite'

import { migrateAppDatabase } from './conversation-store-migrations'

export function openAppDatabase(databaseFile: string): Database {
	const database = new Database(databaseFile, { create: true })
	database.exec('PRAGMA journal_mode = WAL;')
	database.exec('PRAGMA foreign_keys = ON;')
	migrateAppDatabase(database)
	return database
}
