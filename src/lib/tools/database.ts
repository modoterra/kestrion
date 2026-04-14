import type { Database } from 'bun:sqlite'

import { openAppDatabase } from '../app-database'
import { getAppPaths } from './common'
import type { ToolExecutionContext } from './tool-types'

export function withToolDatabase<TResult>(
	context: ToolExecutionContext,
	callback: (database: Database) => TResult
): TResult {
	const database = openAppDatabase(getAppPaths(context).databaseFile)

	try {
		return callback(database)
	} finally {
		database.close()
	}
}
