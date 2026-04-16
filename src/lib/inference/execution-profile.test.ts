import { expect, test } from 'bun:test'

import type { ResolvedAppConfig } from '../config'
import type { ConversationRecord, MessageRecord } from '../types'
import { buildInferenceRequest } from './execution-profile'

test('uses the generic fallback for unknown models', () => {
	const prepared = buildInferenceRequest({
		config: createResolvedConfig(),
		conversation: createConversation('custom-model'),
		messages: [createMessage('user', 'Tell me a joke.')]
	})

	expect(prepared.profileId).toBe('generic')
	expect(prepared.modeId).toBe('generic')
	expect(prepared.request.temperature).toBe(0.6)
	expect(prepared.request.topP).toBeUndefined()
	expect(prepared.request.maxTokens).toBe(1024)
	expect(prepared.request.promptTruncateLength).toBe(6000)
	expect(prepared.request.messages.map(message => message.role)).toEqual(['system', 'user'])
	expect(prepared.request.messages[0]?.content).toContain('CURRENT DATE, TIME, AND TIME ZONE:')
})

test('chooses Kimi instant mode for simple iterative requests', () => {
	const prepared = buildInferenceRequest({
		config: createResolvedConfig(),
		conversation: createConversation(),
		messages: [
			createMessage('assistant', 'Here is the first version.'),
			createMessage('user', 'Now format that as a clean markdown table.')
		]
	})

	expect(prepared.profileId).toBe('kimi-k2p5')
	expect(prepared.modeId).toBe('instant')
	expect(prepared.request.reasoningEffort).toBe('none')
	expect(prepared.request.temperature).toBe(0.6)
	expect(prepared.request.topP).toBe(0.95)
	expect(prepared.request.maxTokens).toBe(2048)
	expect(prepared.request.promptTruncateLength).toBe(8000)
	expect(prepared.request.messages.map(message => message.role)).toEqual(['system', 'assistant', 'assistant', 'user'])
	expect(prepared.request.messages[1]?.content).toContain(
		'Continue from the existing conversation instead of restarting.'
	)
})

test('chooses Kimi thinking mode for planning and tradeoff-heavy requests', () => {
	const prepared = buildInferenceRequest({
		config: createResolvedConfig(),
		conversation: createConversation(),
		messages: [
			createMessage(
				'user',
				'Compare two architecture options, list the tradeoffs, explain the root cause hypotheses, and give me a step-by-step plan to debug the issue.'
			)
		]
	})

	expect(prepared.profileId).toBe('kimi-k2p5')
	expect(prepared.modeId).toBe('thinking')
	expect(prepared.request.reasoningEffort).toBe('medium')
	expect(prepared.request.temperature).toBe(1.0)
	expect(prepared.request.topP).toBe(0.95)
	expect(prepared.request.maxTokens).toBe(4096)
	expect(prepared.request.promptTruncateLength).toBe(12000)
	expect(prepared.request.messages.map(message => message.role)).toEqual(['system', 'assistant', 'user'])
	expect(prepared.request.messages[1]?.content).toContain('reason more deeply up front')
})

test('matches the curated Kimi profile for the Fireworks turbo router id', () => {
	const prepared = buildInferenceRequest({
		config: createResolvedConfig(),
		conversation: createConversation('accounts/fireworks/routers/kimi-k2p5-turbo'),
		messages: [createMessage('user', 'Please fix the formatting and tighten the prose.')]
	})

	expect(prepared.profileId).toBe('kimi-k2p5')
	expect(prepared.modeId).toBe('instant')
	expect(prepared.request.reasoningEffort).toBe('none')
})

function createResolvedConfig(): ResolvedAppConfig {
	return {
		configFile: '/tmp/config.json',
		defaultProvider: 'fireworks',
		matrixPromptError: null,
		matrixPromptPath: '/tmp/MATRIX.md',
		providers: {
			fireworks: {
				apiKey: 'demo-key',
				apiKeyEnv: 'FIREWORKS_API_KEY',
				apiKeySource: 'config',
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

function createConversation(model = 'accounts/fireworks/models/kimi-k2p5'): ConversationRecord {
	return {
		createdAt: '2026-04-15T00:00:00.000Z',
		id: 'conversation-1',
		model,
		provider: 'fireworks',
		title: 'Fresh session',
		updatedAt: '2026-04-15T00:00:00.000Z'
	}
}

function createMessage(role: MessageRecord['role'], content: string): MessageRecord {
	return {
		content,
		conversationId: 'conversation-1',
		createdAt: '2026-04-15T00:00:00.000Z',
		id: `message-${role}-${content.length}`,
		model: role === 'assistant' ? 'accounts/fireworks/models/kimi-k2p5' : null,
		provider: role === 'assistant' ? 'fireworks' : null,
		role
	}
}
