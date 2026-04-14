import type { AppDatabase } from '../app-database'
import { openAppDatabaseConnectionWithDrizzle } from '../app-database'
import { getAppPaths } from './common'
import type { ToolExecutionContext } from './tool-types'

export function withToolDatabase<TResult>(
	context: ToolExecutionContext,
	callback: (database: AppDatabase) => TResult
): TResult {
	const connection = openAppDatabaseConnectionWithDrizzle(getAppPaths(context).databaseFile)

	try {
		return callback(connection.db)
	} finally {
		connection.client.close()
	}
}
