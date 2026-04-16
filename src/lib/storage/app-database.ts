import type { Database } from 'bun:sqlite'

import { openAppDatabaseConnection, type AppDatabase, type AppDatabaseConnection } from '../../db'

export function openAppDatabase(databaseFile: string): Database {
	return openAppDatabaseConnection(databaseFile).client
}

export function openAppDatabaseConnectionWithDrizzle(databaseFile: string): AppDatabaseConnection {
	return openAppDatabaseConnection(databaseFile)
}

export type { AppDatabase, AppDatabaseConnection }
