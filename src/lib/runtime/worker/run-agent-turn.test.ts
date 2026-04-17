import { afterEach, expect, test } from 'bun:test'

import { createFireworksTextStreamEvent } from '../../../test/fireworks-stream-test-utils'
import {
	clearMockFireworksScenarioResponses,
	mockFireworksScenarioResponses,
	readMockFireworksScenarioRequests
} from '../../../test/mock-fireworks-scenarios'
import type { ResolvedAppConfig } from '../../config'
import { runAgentTurn } from './run-agent-turn'
import type { WorkerTurnInput } from './types'

afterEach(() => {
	clearMockFireworksScenarioResponses()
})

test('uses Kimi thinking tuning in the worker path', async () => {
	mockFireworksScenarioResponses([
		{
			events: [
				createFireworksTextStreamEvent('Here is the plan.', {
					id: 'chatcmpl_worker_thinking',
					model: 'accounts/fireworks/models/kimi-k2p5'
				}),
				{ data: '[DONE]' }
			],
			kind: 'stream'
		}
	])

	await runAgentTurn(createWorkerTurnInput(), () => {})

	const [requestBody] = readMockFireworksScenarioRequests()
	const parsedBody = JSON.parse(requestBody ?? '{}') as {
		extra_body?: unknown
		max_tokens?: number
		messages?: Array<{ content?: string; role?: string }>
		prompt_truncate_len?: number
		reasoning_effort?: string
		temperature?: number
		top_p?: number
	}

	expect(parsedBody.temperature).toBe(1.0)
	expect(parsedBody.top_p).toBe(0.95)
	expect(parsedBody.max_tokens).toBe(4096)
	expect(parsedBody.prompt_truncate_len).toBe(12000)
	expect(parsedBody.extra_body).toBeUndefined()
	expect(parsedBody.reasoning_effort).toBe('medium')
	expect(parsedBody.messages?.map(message => message.role)).toEqual(['system', 'assistant', 'user'])
	expect(parsedBody.messages?.[1]?.content).toContain('reason more deeply up front')
})

function createWorkerTurnInput(): WorkerTurnInput {
	return {
		config: createResolvedConfig(),
		conversation: {
			createdAt: '2026-04-15T00:00:00.000Z',
			id: 'conversation-1',
			model: 'accounts/fireworks/models/kimi-k2p5',
			provider: 'fireworks',
			title: 'Fresh session',
			updatedAt: '2026-04-15T00:00:00.000Z'
		},
		filesystem: { defaultReadRoot: '/tmp/agent', readRoots: ['/tmp/agent'], writeRoots: ['/tmp/agent'] },
		messages: [
			{
				content:
					'Compare two architecture options, list the tradeoffs, explain the root cause hypotheses, and give me a step-by-step plan to debug the issue.',
				conversationId: 'conversation-1',
				createdAt: '2026-04-15T00:00:00.000Z',
				id: 'message-1',
				model: null,
				provider: null,
				role: 'user'
			}
		],
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
				apiKey: 'test-api-key',
				apiKeyEnv: 'FIREWORKS_API_KEY',
				apiKeySource: 'config',
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
