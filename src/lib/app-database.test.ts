import { Database } from 'bun:sqlite'
import { afterEach, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { openAppDatabaseConnectionWithDrizzle } from './app-database'
import { migrateAppDatabase } from './conversation-store-migrations'

const cleanupPaths: string[] = []

afterEach(() => {
	for (const path of cleanupPaths.splice(0)) {
		rmSync(path, { force: true, recursive: true })
	}
})

test('bootstraps the Drizzle migration journal for an existing legacy database', () => {
	const tempDir = mkdtempSync(join(tmpdir(), 'kestrion-db-'))
	cleanupPaths.push(tempDir)
	const databaseFile = join(tempDir, 'kestrion.sqlite')

	const legacyDatabase = new Database(databaseFile, { create: true })
	migrateAppDatabase(legacyDatabase)
	legacyDatabase.close()

	const connection = openAppDatabaseConnectionWithDrizzle(databaseFile)
	connection.client.close()

	const database = new Database(databaseFile)
	const drizzleMigrationCount = database.prepare('SELECT COUNT(*) AS count FROM "__drizzle_migrations"').get() as {
		count: number
	}
	const userVersion = (database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
	database.close()

	expect(userVersion).toBe(4)
	expect(drizzleMigrationCount.count).toBe(1)
})
