import { afterEach, expect, test } from 'bun:test'

import type { ResolvedAppConfig } from '../../config'
import { buildSandboxTurnInput, SANDBOX_CONFIG_FILE } from './sandbox'
import type { WorkerTurnRequest } from './types'

const originalFireworksApiKey = process.env.FIREWORKS_API_KEY

afterEach(() => {
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

function createWorkerTurnRequest(): WorkerTurnRequest {
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
		hostMounts: { agentRoot: '/tmp/agent', configRoot: '/tmp/config' },
		messages: [],
		turnId: 'turn-1'
	}
}

function createResolvedConfig(): ResolvedAppConfig {
	return {
		configFile: '/tmp/config/config.json',
		defaultProvider: 'fireworks',
		matrixPromptError: null,
		matrixPromptPath: '/tmp/config/MATRIX.md',
		providers: {
			fireworks: {
				apiKey: '',
				apiKeyEnv: 'FIREWORKS_API_KEY',
				apiKeySource: 'missing',
				baseUrl: 'https://api.fireworks.ai/inference/v1',
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
