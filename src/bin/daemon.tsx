import { loadAppConfig } from '../lib/config'
import { resolveAppPaths } from '../lib/paths'
import { resolveAppRoot } from '../lib/runtime/app-root'
import { DaemonServer } from '../lib/runtime/daemon/server'
import { SubprocessTurnRunner } from '../lib/runtime/worker/subprocess-turn-runner'

const appRoot = resolveAppRoot(import.meta.url)
const paths = resolveAppPaths()
const config = loadAppConfig(paths)
const server = new DaemonServer(paths, config, new SubprocessTurnRunner({ appRoot }))

await server.start()

const shutdown = async (): Promise<void> => {
	await server.stop()
	process.exitCode = 0
}

process.on('SIGINT', () => {
	void shutdown()
})
process.on('SIGTERM', () => {
	void shutdown()
})
