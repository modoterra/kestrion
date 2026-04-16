import { join } from 'node:path'

export const CLI_BINARY_NAME = 'kestrion'
export const DAEMON_BINARY_NAME = 'kestriond'
export const WORKER_BINARY_NAME = 'kestrionw'
export const SOURCE_CLI_ENTRYPOINT = 'src/bin/cli.tsx'
export const SOURCE_DAEMON_ENTRYPOINT = 'src/bin/daemon.tsx'
export const SOURCE_WORKER_ENTRYPOINT = 'src/bin/worker.tsx'

export function resolveCliEntrypoint(appRoot: string): string {
	return join(appRoot, SOURCE_CLI_ENTRYPOINT)
}

export function resolveDaemonEntrypoint(appRoot: string): string {
	return join(appRoot, SOURCE_DAEMON_ENTRYPOINT)
}

export function resolveWorkerEntrypoint(appRoot: string): string {
	return join(appRoot, SOURCE_WORKER_ENTRYPOINT)
}
