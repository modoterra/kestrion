import { appendFileSync } from 'node:fs'

type DaemonLogLevel = 'debug' | 'error' | 'info' | 'warn'

type DaemonLogEntry = {
	data?: Record<string, unknown>
	event: string
	level: DaemonLogLevel
	scope: string
	timestamp: string
}

export type DaemonLogger = {
	child: (scope: string) => DaemonLogger
	debug: (event: string, data?: Record<string, unknown>) => void
	error: (event: string, data?: Record<string, unknown>) => void
	info: (event: string, data?: Record<string, unknown>) => void
	warn: (event: string, data?: Record<string, unknown>) => void
}

type DaemonLoggerOptions = {
	stdout?: boolean
	stdoutWriter?: (line: string) => void
}

const NOOP_LOGGER: DaemonLogger = {
	child: () => NOOP_LOGGER,
	debug: () => {},
	error: () => {},
	info: () => {},
	warn: () => {}
}

export function createDaemonLogger(logFile: string, scope = 'daemon', options: DaemonLoggerOptions = {}): DaemonLogger {
	return {
		child: childScope => createDaemonLogger(logFile, `${scope}.${childScope}`, options),
		debug: (event, data) =>
			writeDaemonLog(logFile, { data, event, level: 'debug', scope, timestamp: new Date().toISOString() }, options),
		error: (event, data) =>
			writeDaemonLog(logFile, { data, event, level: 'error', scope, timestamp: new Date().toISOString() }, options),
		info: (event, data) =>
			writeDaemonLog(logFile, { data, event, level: 'info', scope, timestamp: new Date().toISOString() }, options),
		warn: (event, data) =>
			writeDaemonLog(logFile, { data, event, level: 'warn', scope, timestamp: new Date().toISOString() }, options)
	}
}

export function createNoopDaemonLogger(): DaemonLogger {
	return NOOP_LOGGER
}

function writeDaemonLog(logFile: string, entry: DaemonLogEntry, options: DaemonLoggerOptions): void {
	const line = `${JSON.stringify(entry)}\n`
	appendFileSync(logFile, line, 'utf8')

	if (options.stdout) {
		(options.stdoutWriter ?? writeDaemonLogToStdout)(line)
	}
}

function writeDaemonLogToStdout(line: string): void {
	process.stdout.write(line)
}
