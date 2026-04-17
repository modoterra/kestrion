import { createCliRenderer, type KeyEvent } from '@opentui/core'
import { createRoot } from '@opentui/react'
import type { ReactNode } from 'react'

import { App } from '../app'
import '../opentui-extensions'
import { quitApplication } from '../lib/app/quit'
import { resolveAppPaths } from '../lib/paths'
import { DaemonClient } from '../lib/runtime/daemon/client'
import { THEME } from '../lib/ui/constants'
import { shouldExitCliForKey } from './cli-exit'

process.on('uncaughtException', error => {
	process.stderr.write(`Kestrion uncaught exception: ${error.stack ?? error.message}\n`)
})

process.on('unhandledRejection', reason => {
	const message = reason instanceof Error ? (reason.stack ?? reason.message) : String(reason)
	process.stderr.write(`Kestrion unhandled rejection: ${message}\n`)
})

const packageInfo = (await Bun.file(new URL('../../package.json', import.meta.url)).json()) as {
	buildHash?: string
	version?: string
}
const buildLabel = `v${packageInfo.version ?? '0.0.0'}${packageInfo.buildHash ? ` (${packageInfo.buildHash})` : ''}`

const paths = resolveAppPaths()
let clientRef: DaemonClient | null = null
let appReady = false
let cleanupExitHandlers = (): void => {}
const renderer = await createCliRenderer({
	exitOnCtrlC: false,
	onDestroy: () => {
		cleanupExitHandlers()
		clientRef?.close()
	}
})
const root = createRoot(renderer)
cleanupExitHandlers = registerGlobalExitHandlers(renderer, () => appReady)

root.render(
	<CliStartupScreen
		buildLabel={buildLabel}
		status={`Connecting to daemon at ${paths.socketFile}... Press Ctrl+C to quit.`}
	/>
)

try {
	const { bootstrap, client } = await DaemonClient.connect(paths)
	clientRef = client
	appReady = true
	process.stderr.write(`kestrion cli connected to ${paths.socketFile}\n`)

	root.render(
		<App
			buildLabel={buildLabel}
			config={bootstrap.config}
			fireworksModels={bootstrap.fireworksModels}
			initialConversations={bootstrap.conversations}
			initialThread={bootstrap.thread}
			initialWritableConfig={bootstrap.writableConfig}
			onExit={() => {
				quitApplication(renderer)
			}}
			paths={paths}
			service={client}
		/>
	)
} catch (error) {
	const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
	process.stderr.write(`Kestrion startup failed: ${message}\n`)
	root.render(
		<CliStartupScreen
			buildLabel={buildLabel}
			error={error}
			status='Failed to connect to the daemon. Press Ctrl+C to quit.'
		/>
	)
}

function CliStartupScreen({
	buildLabel,
	error,
	status
}: {
	buildLabel: string
	error?: unknown
	status: string
}): ReactNode {
	return (
		<box
			backgroundColor='black'
			flexDirection='column'
			height='100%'
			paddingLeft={2}
			paddingRight={2}
			paddingTop={1}
			width='100%'>
			<text
				fg={THEME.offWhite}
				selectable={false}>
				Kestrion
			</text>
			<text
				fg={THEME.muted}
				selectable={false}>
				{buildLabel}
			</text>
			<text
				fg={error ? THEME.danger : THEME.accent}
				selectable>
				{status}
			</text>
			{error ? (
				<text
					fg={THEME.softText}
					selectable>
					{error instanceof Error ? (error.stack ?? error.message) : String(error)}
				</text>
			) : null}
		</box>
	)
}

function registerGlobalExitHandlers(
	renderer: {
		destroy: () => void
		keyInput: {
			off: (event: 'keypress', listener: (key: KeyEvent) => void) => void
			on: (event: 'keypress', listener: (key: KeyEvent) => void) => void
		}
	},
	getAppReady: () => boolean
): () => void {
	let exiting = false
	const exit = (): void => {
		if (exiting) {
			return
		}

		exiting = true
		quitApplication(renderer)
	}
	const handleKeypress = (key: KeyEvent): void => {
		if (shouldExitCliForKey(key, getAppReady())) {
			exit()
		}
	}
	const handleSignal = (): void => {
		exit()
	}
	const handleStdinEnd = (): void => {
		if (!getAppReady()) {
			exit()
		}
	}

	renderer.keyInput.on('keypress', handleKeypress)
	process.on('SIGINT', handleSignal)
	process.on('SIGTERM', handleSignal)
	process.stdin.on('end', handleStdinEnd)

	return (): void => {
		renderer.keyInput.off('keypress', handleKeypress)
		process.off('SIGINT', handleSignal)
		process.off('SIGTERM', handleSignal)
		process.stdin.off('end', handleStdinEnd)
	}
}
