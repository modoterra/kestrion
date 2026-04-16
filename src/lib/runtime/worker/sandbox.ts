import { existsSync, realpathSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import type { ResolvedAppConfig } from '../../config'
import { SOURCE_WORKER_ENTRYPOINT } from '../entrypoints'
import type { WorkerTurnInput, WorkerTurnRequest } from './types'

export const SANDBOX_AGENT_ROOT = '/agent'
export const SANDBOX_APP_ROOT = '/runtime/app'
export const SANDBOX_BUN_PATH = '/runtime/bin/bun'
export const SANDBOX_CONFIG_FILE = '/config/config.json'
export const SANDBOX_CONFIG_ROOT = '/config'
export const SANDBOX_HOST_RESPONSE_ROOT = '/runtime/turn/host-responses'
export const SANDBOX_MOCK_ROOT = '/runtime/test/fireworks'
export const SANDBOX_SCENARIO_ROOT = '/runtime/test/fireworks-scenarios'
export const SANDBOX_SCRATCH_ROOT = '/scratch'
export const SANDBOX_TURN_INPUT_FILE = '/runtime/turn/input.json'
export const SANDBOX_TMP_ROOT = '/tmp'

const TEST_FIREWORKS_SCENARIO_FILE_ENV = 'KESTRION_TEST_FIREWORKS_SCENARIO_FILE'
const TURN_INPUT_FILE_ENV = 'KESTRION_WORKER_TURN_INPUT_FILE'
const TEST_RESPONSE_QUEUE_ENV = 'KESTRION_TEST_FIREWORKS_RESPONSE_QUEUE_FILE'

export function buildSandboxTurnInput(request: WorkerTurnRequest): WorkerTurnInput {
	return {
		config: createSandboxConfig(request.config),
		conversation: request.conversation,
		filesystem: {
			defaultReadRoot: SANDBOX_AGENT_ROOT,
			readRoots: [SANDBOX_AGENT_ROOT, SANDBOX_CONFIG_ROOT],
			writeRoots: [SANDBOX_AGENT_ROOT]
		},
		messages: request.messages,
		turnId: request.turnId
	}
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

export function createSandboxCommand(
	appRoot: string,
	bunExecutable: string,
	request: WorkerTurnRequest,
	hostTurnDirectory: string
): { args: string[]; env: NodeJS.ProcessEnv } {
	const args = createBaseSandboxArgs()
	const childEnv: NodeJS.ProcessEnv = { ...process.env, HOME: '/nonexistent', TMPDIR: SANDBOX_TMP_ROOT }

	addCoreSandboxMounts(args, appRoot, bunExecutable, request, hostTurnDirectory)
	addRuntimeSupportMounts(args)
	childEnv[TURN_INPUT_FILE_ENV] = SANDBOX_TURN_INPUT_FILE
	addTestFixtureMounts(args, childEnv)
	addWorkerEntrypoint(args)

	return { args, env: childEnv }
}

function createBaseSandboxArgs(): string[] {
	return [
		'--die-with-parent',
		'--new-session',
		'--unshare-pid',
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
		'/runtime/turn',
		'--dir',
		'/runtime/test',
		'--dir',
		SANDBOX_MOCK_ROOT,
		'--dir',
		SANDBOX_SCENARIO_ROOT,
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
	request: WorkerTurnRequest,
	hostTurnDirectory: string
): void {
	addReadonlyMount(args, realpathSync(appRoot), SANDBOX_APP_ROOT)
	addReadonlyMount(args, realpathSync(bunExecutable), SANDBOX_BUN_PATH)
	addReadonlyMount(args, realpathSync(hostTurnDirectory), '/runtime/turn')
	addWritableMount(args, realpathSync(request.hostMounts.agentRoot), SANDBOX_AGENT_ROOT)
	addReadonlyMount(args, realpathSync(request.hostMounts.configRoot), SANDBOX_CONFIG_ROOT)
}

function addTestFixtureMounts(args: string[], childEnv: NodeJS.ProcessEnv): void {
	mountOptionalFixture(args, childEnv, TEST_RESPONSE_QUEUE_ENV, SANDBOX_MOCK_ROOT)
	mountOptionalFixture(args, childEnv, TEST_FIREWORKS_SCENARIO_FILE_ENV, SANDBOX_SCENARIO_ROOT)
}

function mountOptionalFixture(args: string[], childEnv: NodeJS.ProcessEnv, envKey: string, sandboxRoot: string): void {
	const hostFile = process.env[envKey]?.trim()
	if (!hostFile) {
		return
	}

	const resolvedHostFile = realpathSync(hostFile)
	addWritableMount(args, dirname(resolvedHostFile), sandboxRoot)
	childEnv[envKey] = join(sandboxRoot, basename(resolvedHostFile))
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
		TURN_INPUT_FILE_ENV,
		SANDBOX_TURN_INPUT_FILE,
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
	addOptionalReadonlyMount(args, '/etc/nsswitch.conf', '/etc/nsswitch.conf')
	addOptionalReadonlyMount(args, '/etc/resolv.conf', '/etc/resolv.conf')
	addOptionalReadonlyMount(args, '/etc/ssl', '/etc/ssl')
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
