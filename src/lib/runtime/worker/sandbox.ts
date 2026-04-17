import { existsSync, realpathSync } from 'node:fs'

import type { ResolvedAppConfig } from '../../config'
import { SOURCE_WORKER_ENTRYPOINT } from '../entrypoints'
import type {
	WorkerFilesystemRoots,
	WorkerSessionBootstrap,
	WorkerSessionRequest,
	WorkerTurnInput,
	WorkerTurnRequest
} from './types'

export const SANDBOX_AGENT_ROOT = '/agent'
export const SANDBOX_APP_ROOT = '/runtime/app'
export const SANDBOX_BUN_PATH = '/runtime/bin/bun'
export const SANDBOX_CONFIG_FILE = '/config/config.json'
export const SANDBOX_CONFIG_ROOT = '/config'
export const SANDBOX_SCRATCH_ROOT = '/scratch'
export const SANDBOX_TMP_ROOT = '/tmp'
export const SANDBOX_TURN_INPUT_FILE = '/runtime/turn/input.json'

const NOBODY_GID = '65534'
const NOBODY_UID = '65534'
const TURN_INPUT_FILE_ENV = 'KESTRION_WORKER_TURN_INPUT_FILE'

export function buildSandboxSessionBootstrap(request: WorkerSessionRequest): WorkerSessionBootstrap {
	return { conversationId: request.conversation.id, filesystem: buildSandboxFilesystemRoots(), turnId: request.turnId }
}

export function buildSandboxTurnInput(request: WorkerTurnRequest): WorkerTurnInput {
	return {
		...buildSandboxSessionBootstrap(request),
		config: createSandboxConfig(request.config),
		conversation: request.conversation,
		messages: request.messages
	}
}

export function buildSandboxFilesystemRoots(): WorkerFilesystemRoots {
	return {
		defaultReadRoot: SANDBOX_AGENT_ROOT,
		readRoots: [SANDBOX_AGENT_ROOT, SANDBOX_CONFIG_ROOT],
		writeRoots: [SANDBOX_AGENT_ROOT]
	}
}

export function createSandboxCommand(
	appRoot: string,
	bunExecutable: string,
	sandboxCommand: string,
	request: WorkerSessionRequest,
	_hostTurnDirectory?: string
): { args: string[]; command: string; env: NodeJS.ProcessEnv } {
	const sandboxArgs = createBaseSandboxArgs()
	const childEnv: NodeJS.ProcessEnv = {
		HOME: '/nonexistent',
		LANG: 'C.UTF-8',
		LC_ALL: 'C.UTF-8',
		PATH: '/usr/bin:/bin',
		TMPDIR: SANDBOX_TMP_ROOT,
		[TURN_INPUT_FILE_ENV]: SANDBOX_TURN_INPUT_FILE
	}

	addCoreSandboxMounts(sandboxArgs, appRoot, bunExecutable, request)
	addRuntimeSupportMounts(sandboxArgs)
	addWorkerEntrypoint(sandboxArgs)

	return { args: sandboxArgs, command: sandboxCommand, env: childEnv }
}

function createSandboxConfig(config: ResolvedAppConfig): ResolvedAppConfig {
	const fireworks = { ...config.providers.fireworks }
	const envApiKey = process.env[fireworks.apiKeyEnv]?.trim()

	if (!fireworks.apiKey && envApiKey) {
		fireworks.apiKey = envApiKey
		fireworks.apiKeySource = 'env'
	}

	return { ...config, configFile: SANDBOX_CONFIG_FILE, providers: { ...config.providers, fireworks } }
}

function createBaseSandboxArgs(): string[] {
	return [
		'--die-with-parent',
		'--clearenv',
		'--cap-drop',
		'ALL',
		'--new-session',
		'--unshare-ipc',
		'--unshare-net',
		'--unshare-pid',
		'--unshare-user',
		'--unshare-uts',
		'--uid',
		NOBODY_UID,
		'--gid',
		NOBODY_GID,
		'--proc',
		'/proc',
		'--dev',
		'/dev',
		'--tmpfs',
		SANDBOX_TMP_ROOT,
		'--tmpfs',
		SANDBOX_SCRATCH_ROOT,
		'--dir',
		'/runtime',
		'--dir',
		'/runtime/bin',
		'--dir',
		'/usr',
		'--dir',
		'/etc'
	]
}

function addCoreSandboxMounts(
	args: string[],
	appRoot: string,
	bunExecutable: string,
	request: WorkerSessionRequest
): void {
	addReadonlyMount(args, realpathSync(appRoot), SANDBOX_APP_ROOT)
	addReadonlyMount(args, realpathSync(bunExecutable), SANDBOX_BUN_PATH)
	addWritableMount(args, realpathSync(request.hostMounts.agentRoot), SANDBOX_AGENT_ROOT)
	addReadonlyMount(args, realpathSync(request.hostMounts.configRoot), SANDBOX_CONFIG_ROOT)
}

function addWorkerEntrypoint(args: string[]): void {
	args.push(
		'--chdir',
		SANDBOX_APP_ROOT,
		'--setenv',
		'TMPDIR',
		SANDBOX_TMP_ROOT,
		'--setenv',
		'HOME',
		'/nonexistent',
		'--setenv',
		'LANG',
		'C.UTF-8',
		'--setenv',
		'LC_ALL',
		'C.UTF-8',
		'--setenv',
		'PATH',
		'/usr/bin:/bin',
		'--',
		SANDBOX_BUN_PATH,
		`${SANDBOX_APP_ROOT}/${SOURCE_WORKER_ENTRYPOINT}`
	)
}

function addRuntimeSupportMounts(args: string[]): void {
	addOptionalReadonlyMount(args, '/usr/lib', '/usr/lib')
	addOptionalReadonlyMount(args, '/usr/lib', '/lib')
	addOptionalReadonlyMount(args, '/usr/lib64', '/usr/lib64')
	addOptionalReadonlyMount(args, '/usr/lib64', '/lib64')
	addOptionalReadonlyMount(args, '/etc/hosts', '/etc/hosts')
}

function addOptionalReadonlyMount(args: string[], source: string, target: string): void {
	if (!existsSync(source)) {
		return
	}

	addReadonlyMount(args, source, target)
}

function addReadonlyMount(args: string[], source: string, target: string): void {
	args.push('--ro-bind', source, target)
}

function addWritableMount(args: string[], source: string, target: string): void {
	args.push('--bind', source, target)
}
