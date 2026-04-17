export type DaemonStartupOptions = {
	logToStdout: boolean
}

const STDOUT_LOG_FLAG = '--stdout-logs'

export function resolveDaemonStartupOptions(argv: string[]): DaemonStartupOptions {
	return {
		logToStdout: argv.includes(STDOUT_LOG_FLAG)
	}
}
