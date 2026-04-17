import { afterEach, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { ResolvedAppConfig } from '../../config'
import { buildSandboxTurnInput, createSandboxCommand, SANDBOX_CONFIG_FILE, SANDBOX_TURN_INPUT_FILE } from './sandbox'
import type { WorkerTurnRequest } from './types'

const cleanupPaths: string[] = []
const originalFireworksApiKey = process.env.FIREWORKS_API_KEY

afterEach(() => {
	for (const path of cleanupPaths.splice(0).toReversed()) {
		rmSync(path, { force: true, recursive: true })
	}
	if (originalFireworksApiKey === undefined) {
		delete process.env.FIREWORKS_API_KEY
	} else {
		process.env.FIREWORKS_API_KEY = originalFireworksApiKey
	}
})

test('buildSandboxTurnInput rehydrates an env-backed Fireworks API key for the worker', () => {
	process.env.FIREWORKS_API_KEY = 'env-secret'

	const input = buildSandboxTurnInput(createWorkerTurnRequest())

	expect(input.config.configFile).toBe(SANDBOX_CONFIG_FILE)
	expect(input.config.providers.fireworks.apiKey).toBe('env-secret')
	expect(input.config.providers.fireworks.apiKeySource).toBe('env')
})

test('createSandboxCommand clears inherited env and applies hardened namespace args', () => {
	const sandboxRoot = mkdtempSync(join(tmpdir(), 'kestrion-sandbox-test-'))
	const appRoot = join(sandboxRoot, 'app')
	const agentRoot = join(sandboxRoot, 'agent')
	const configRoot = join(sandboxRoot, 'config')
	const turnRoot = join(sandboxRoot, 'turn')
	cleanupPaths.push(sandboxRoot)
	mkdirSync(appRoot, { recursive: true })
	mkdirSync(agentRoot, { recursive: true })
	mkdirSync(configRoot, { recursive: true })
	mkdirSync(turnRoot, { recursive: true })

	const command = createSandboxCommand(
		appRoot,
		process.execPath,
		'bwrap',
		createWorkerTurnRequest(agentRoot, configRoot),
		turnRoot
	)

	expect(command.command).toBe('bwrap')
	expect(command.args).toEqual(
		expect.arrayContaining([
			'--clearenv',
			'--cap-drop',
			'ALL',
			'--unshare-ipc',
			'--unshare-pid',
			'--unshare-user',
			'--unshare-uts',
			'--uid',
			'65534',
			'--gid',
			'65534'
		])
	)
	expect(command.env.HOME).toBe('/nonexistent')
	expect(command.env.TMPDIR).toBe('/tmp')
	expect(command.env.KESTRION_WORKER_TURN_INPUT_FILE).toBe(SANDBOX_TURN_INPUT_FILE)
	expect(command.env.FIREWORKS_API_KEY).toBeUndefined()
})

function createWorkerTurnRequest(agentRoot = '/tmp/agent', configRoot = '/tmp/config'): WorkerTurnRequest {
	return {
		config: createResolvedConfig(),
		conversation: {
			createdAt: '2026-04-14T00:00:00.000Z',
			id: 'conversation-1',
			model: 'accounts/fireworks/models/kimi-k2p5',
			provider: 'fireworks',
			title: 'Fresh session',
			updatedAt: '2026-04-14T00:00:00.000Z'
		},
		hostMounts: { agentRoot, configRoot },
		messages: [],
		turnId: 'turn-1'
	}
}

function createResolvedConfig(): ResolvedAppConfig {
	return {
		configFile: '/tmp/config/config.json',
		defaultProvider: 'fireworks',
		mcp: {
			enabled: false,
			endpoint: '',
			pat: '',
			patEnv: 'KESTRION_MCP_PAT',
			patSource: 'missing'
		},
		matrixPromptError: null,
		matrixPromptPath: '/tmp/config/MATRIX.md',
		providers: {
			fireworks: {
				apiKey: '',
				apiKeyEnv: 'FIREWORKS_API_KEY',
				apiKeySource: 'missing',
				baseUrl: 'https://api.fireworks.ai/inference/v1',
				compactAutoPromptChars: 4000,
				compactAutoTurnThreshold: 8,
				compactTailTurns: 4,
				maxTokens: 1024,
				model: 'accounts/fireworks/models/kimi-k2p5',
				promptTruncateLength: 6000,
				providerMode: 'fireworks',
				temperature: 0.6
			}
		},
		systemPrompt: 'You are Kestrion.'
	}
}
