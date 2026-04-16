import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { createConnection } from 'node:net'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

import { resolveAppPaths } from '../lib/paths'
import { resolveAppRoot } from '../lib/runtime/app-root'
import { resolveCliEntrypoint, resolveDaemonEntrypoint } from '../lib/runtime/entrypoints'
import { ensureDevSeedData } from './dev-seed'

const appRoot = resolveAppRoot(import.meta.url)
type DevEnvironment = { env: NodeJS.ProcessEnv; paths: ReturnType<typeof resolveAppPaths>; rootDir: string }

export async function runDev(): Promise<void> {
	const environment = createDevEnvironment()
	const daemon = spawnBunScript(resolveDaemonEntrypoint(appRoot), environment.env, ['ignore', 'inherit', 'inherit'])
	let cleanedUp = false
	const onSigint = (): void => {
		void exitFromSignal('SIGINT', 130)
	}
	const onSigterm = (): void => {
		void exitFromSignal('SIGTERM', 143)
	}

	registerSignalHandlers(onSigint, onSigterm)

	try {
		await waitForDaemon(environment.paths.socketFile, daemon)
		process.exitCode = await runCli(environment.env)
	} finally {
		await cleanup()
	}

	async function exitFromSignal(signal: 'SIGINT' | 'SIGTERM', exitCode: number): Promise<void> {
		process.exitCode = exitCode
		removeSignalHandlers(onSigint, onSigterm)
		await cleanup()
		process.kill(process.pid, signal)
	}

	async function cleanup(): Promise<void> {
		if (cleanedUp) {
			return
		}

		cleanedUp = true
		daemon.kill('SIGTERM')
		await waitForChildExit(daemon).catch(() => {})
	}
}

if (import.meta.main) {
	await runDev()
}

export function createDevEnvironment(baseEnv: NodeJS.ProcessEnv = process.env): DevEnvironment {
	const rootDir = join(appRoot, '.runtime')
	const configDir = join(rootDir, 'config')
	const dataDir = join(rootDir, 'share')
	mkdirSync(configDir, { recursive: true })
	mkdirSync(dataDir, { recursive: true })
	const env = {
		...baseEnv,
		HOME: rootDir,
		KESTRION_RUNTIME_DIR: rootDir,
		USERPROFILE: rootDir,
		XDG_CONFIG_HOME: configDir,
		XDG_DATA_HOME: dataDir,
		XDG_RUNTIME_DIR: rootDir
	}
	const paths = resolveAppPaths({
		configRootName: 'config',
		dataRootName: 'share',
		homeDir: rootDir,
		runtimeDir: rootDir
	})
	ensureDevSeedData(paths)

	return { env, paths, rootDir }
}

function registerSignalHandlers(sigintHandler: () => void, sigtermHandler: () => void): void {
	process.on('SIGINT', sigintHandler)
	process.on('SIGTERM', sigtermHandler)
}

function removeSignalHandlers(sigintHandler: () => void, sigtermHandler: () => void): void {
	process.off('SIGINT', sigintHandler)
	process.off('SIGTERM', sigtermHandler)
}

function runCli(env: NodeJS.ProcessEnv): Promise<number> {
	const cli = spawnBunScript(resolveCliEntrypoint(appRoot), env, 'inherit')
	return waitForChildExit(cli)
}

function waitForDaemon(socketFile: string, daemonProcess: ChildProcess): Promise<void> {
	return waitForDaemonAttempt(socketFile, daemonProcess, 100)
}

function canConnectToSocket(socketFile: string): Promise<boolean> {
	return new Promise(resolve => {
		const socket = createConnection(socketFile)
		socket.once('connect', () => {
			socket.destroy()
			resolve(true)
		})
		socket.once('error', () => {
			socket.destroy()
			resolve(false)
		})
	})
}

function spawnBunScript(
	scriptPath: string,
	childEnv: NodeJS.ProcessEnv,
	stdio: 'inherit' | ['ignore', 'inherit', 'inherit']
): ChildProcess {
	return spawn(process.execPath, [scriptPath], { cwd: appRoot, env: childEnv, stdio })
}

async function waitForDaemonAttempt(
	socketFile: string,
	daemonProcess: ChildProcess,
	attemptsRemaining: number
): Promise<void> {
	if (daemonProcess.exitCode !== null) {
		throw new Error(`kestriond exited before the socket became ready (status ${daemonProcess.exitCode}).`)
	}

	if (await canConnectToSocket(socketFile)) {
		return
	}

	if (attemptsRemaining <= 0) {
		throw new Error('Timed out waiting for kestriond to accept connections.')
	}

	await delay(50)
	return waitForDaemonAttempt(socketFile, daemonProcess, attemptsRemaining - 1)
}

function waitForChildExit(child: ChildProcess): Promise<number> {
	if (child.exitCode !== null) {
		return Promise.resolve(child.exitCode)
	}

	return new Promise((resolve, reject) => {
		child.once('error', reject)
		child.once('close', (code, signal) => {
			resolve(code ?? (signal ? 1 : 0))
		})
	})
}
