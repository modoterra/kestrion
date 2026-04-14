import { resolveAppPaths } from '../lib/paths'
import { closeAppDatabaseConnection, openAppDatabaseConnection } from './index'

const connection = openAppDatabaseConnection(resolveAppPaths().databaseFile)
closeAppDatabaseConnection(connection)
