import { loadAppConfig } from '../lib/config'
import { resolveAppPaths } from '../lib/paths'
import { resolveAppRoot } from '../lib/runtime/app-root'
import { DaemonServer } from '../lib/runtime/daemon/server'
import { resolveDaemonStartupOptions } from '../lib/runtime/daemon/startup-options'
import { SubprocessTurnRunner } from '../lib/runtime/worker/subprocess-turn-runner'

const appRoot = resolveAppRoot(import.meta.url)
const startupOptions = resolveDaemonStartupOptions(process.argv.slice(2))
const paths = resolveAppPaths()
const config = loadAppConfig(paths)
const server = new DaemonServer(paths, config, new SubprocessTurnRunner({ appRoot }), undefined, {
	logToStdout: startupOptions.logToStdout
})

await server.start()
process.stderr.write(`kestriond listening on ${paths.socketFile} (logs: ${paths.daemonLogFile})\n`)

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
