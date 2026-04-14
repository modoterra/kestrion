import { afterEach, expect, test } from 'bun:test'
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
	createFireworksStreamResponse,
	createFireworksTextStreamEvent,
	createFireworksToolCallStreamEvent
} from '../../test/fireworks-stream-test-utils'
import { EXPECTED_TOOL_NAMES } from '../../test/tool-test-utils'
import { createWorkspaceRoot } from '../../test/workspace-test-utils'
import type { FireworksProviderConfig } from '../config'
import type { InferenceToolCall } from '../types'
import { FireworksAdapter } from './fireworks-adapter'

const originalFetch = globalThis.fetch
const cleanupPaths: string[] = []

afterEach(() => {
	globalThis.fetch = originalFetch

	for (const path of cleanupPaths.splice(0).toReversed()) {
		rmSync(path, { force: true, recursive: true })
	}
})

test('formats Fireworks chat completion requests', async () => {
	let requestUrl = ''
	let requestBody = ''
	let requestAuthHeader = ''

	globalThis.fetch = ((input, init) => {
		requestUrl = String(input)
		requestBody = String(init?.body ?? '')
		requestAuthHeader = String(new Headers(init?.headers).get('authorization') ?? '')
		return Promise.resolve(createFireworksResponse('Hello from Fireworks'))
	}) as typeof fetch

	const adapter = new FireworksAdapter(createFireworksConfig(), '/tmp/kestrion-config.json')
	const result = await adapter.complete({
		maxTokens: 256,
		messages: [{ content: 'Hello', role: 'user' }],
		model: 'demo-model',
		promptTruncateLength: 2048,
		temperature: 0.2
	})

	const parsedBody = JSON.parse(requestBody) as {
		max_tokens: number
		prompt_truncate_len: number
		tool_choice?: string
		tools?: Array<{ function?: { name?: string } }>
	}

	expect(requestUrl).toBe('https://api.fireworks.ai/inference/v1/chat/completions')
	expect(requestAuthHeader).toBe('Bearer demo-key')
	expect(parsedBody.max_tokens).toBe(256)
	expect(parsedBody.prompt_truncate_len).toBe(2048)
	expect(parsedBody.tool_choice).toBe('auto')
	expect(parsedBody.tools?.map(tool => tool.function?.name)).toEqual(EXPECTED_TOOL_NAMES)
	expect(result.content).toBe('Hello from Fireworks')
	expect(result.provider).toBe('fireworks')
})

test('executes read tool calls before returning the final assistant message', async () => {
	const workspaceRoot = createWorkspaceRoot('.kestrion-fireworks-tool-', path => cleanupPaths.push(path))
	writeFileSync(join(workspaceRoot, 'notes.txt'), 'alpha\nbeta\ngamma\n')
	const requestBodies: string[] = []
	let requestCount = 0

	globalThis.fetch = ((_, init) => {
		requestBodies.push(String(init?.body ?? ''))
		requestCount += 1

		if (requestCount === 1) {
			return Promise.resolve(
				createToolCallResponse({
					argumentsJson: JSON.stringify({ endLine: 2, path: 'notes.txt', startLine: 1 }),
					id: 'call_read_1',
					name: 'read'
				})
			)
		}

		return Promise.resolve(createFireworksResponse('Summarized file contents'))
	}) as typeof fetch

	const adapter = new FireworksAdapter(createFireworksConfig(), '/tmp/kestrion-config.json', workspaceRoot)
	const result = await adapter.complete({
		maxTokens: 256,
		messages: [{ content: 'Read notes.txt and summarize it.', role: 'user' }],
		model: 'demo-model',
		promptTruncateLength: 2048,
		temperature: 0.2
	})

	const secondRequestBody = JSON.parse(requestBodies[1] ?? '{}') as {
		messages?: Array<{ content?: string | null; role?: string; tool_call_id?: string }>
	}
	const toolMessage = secondRequestBody.messages?.find(message => message.role === 'tool')

	expect(requestBodies).toHaveLength(2)
	expect(toolMessage?.tool_call_id).toBe('call_read_1')
	expect(toolMessage?.content).toContain('"ok":true')
	expect(toolMessage?.content).toContain('"path":"notes.txt"')
	expect(toolMessage?.content).toContain('alpha')
	expect(toolMessage?.content).toContain('beta')
	expect(result.content).toBe('Summarized file contents')
})

test('retries without tools when the model rejects tool calling', async () => {
	const requestBodies: string[] = []
	let requestCount = 0

	globalThis.fetch = ((_, init) => {
		requestBodies.push(String(init?.body ?? ''))
		requestCount += 1

		if (requestCount === 1) {
			return Promise.resolve(
				new Response(JSON.stringify({ error: { message: 'This model does not support tool_choice or tools.' } }), {
					headers: { 'Content-Type': 'application/json' },
					status: 400
				})
			)
		}

		return Promise.resolve(createFireworksResponse('Fallback without tools'))
	}) as typeof fetch

	const adapter = new FireworksAdapter(createFireworksConfig(), '/tmp/kestrion-config.json')
	const result = await adapter.complete({
		maxTokens: 256,
		messages: [{ content: 'Hello', role: 'user' }],
		model: 'demo-model',
		promptTruncateLength: 2048,
		temperature: 0.2
	})

	const firstBody = JSON.parse(requestBodies[0] ?? '{}') as { tool_choice?: string; tools?: unknown[] }
	const secondBody = JSON.parse(requestBodies[1] ?? '{}') as { tool_choice?: string; tools?: unknown[] }

	expect(requestBodies).toHaveLength(2)
	expect(firstBody.tool_choice).toBe('auto')
	expect(firstBody.tools?.length).toBe(14)
	expect(secondBody.tool_choice).toBeUndefined()
	expect(secondBody.tools).toBeUndefined()
	expect(result.content).toBe('Fallback without tools')
})

test('streams text deltas without collapsing whitespace', async () => {
	const deltas: string[] = []
	let requestBody = ''

	globalThis.fetch = ((_, init) => {
		requestBody = String(init?.body ?? '')

		return Promise.resolve(
			createFireworksStreamResponse([
				createFireworksTextStreamEvent('Hello'),
				createFireworksTextStreamEvent(' there'),
				{ data: '[DONE]' }
			])
		)
	}) as typeof fetch

	const adapter = new FireworksAdapter(createFireworksConfig(), '/tmp/kestrion-config.json')
	const result = await adapter.complete({
		events: { onTextDelta: delta => deltas.push(delta) },
		maxTokens: 256,
		messages: [{ content: 'Hello', role: 'user' }],
		model: 'demo-model',
		promptTruncateLength: 2048,
		temperature: 0.2
	})

	const parsedBody = JSON.parse(requestBody) as { stream?: boolean }

	expect(parsedBody.stream).toBeTrue()
	expect(deltas).toEqual(['Hello', ' there'])
	expect(result.content).toBe('Hello there')
})

test('fires tool activity callbacks around streamed tool execution', async () => {
	const activityLog: string[] = []
	const seenToolCalls: InferenceToolCall[][] = []

	const workspaceRoot = createWorkspaceRoot('.kestrion-fireworks-tool-', path => cleanupPaths.push(path))
	writeFileSync(join(workspaceRoot, 'notes.txt'), 'alpha\nbeta\ngamma\n')
	globalThis.fetch = createToolStreamingFetchMock()

	const adapter = new FireworksAdapter(createFireworksConfig(), '/tmp/kestrion-config.json', workspaceRoot)
	const result = await adapter.complete({
		events: {
			onToolCallsFinish: toolCalls => {
				activityLog.push(`finish:${toolCalls.map(toolCall => toolCall.name).join(',')}`)
				seenToolCalls.push(toolCalls)
			},
			onToolCallsStart: toolCalls => {
				activityLog.push(`start:${toolCalls.map(toolCall => toolCall.name).join(',')}`)
				seenToolCalls.push(toolCalls)
			}
		},
		maxTokens: 256,
		messages: [{ content: 'Read notes.txt.', role: 'user' }],
		model: 'demo-model',
		promptTruncateLength: 2048,
		temperature: 0.2
	})

	expect(activityLog).toEqual(['start:read', 'finish:read'])
	expect(seenToolCalls).toHaveLength(2)
	expect(seenToolCalls[0]?.[0]).toEqual({
		argumentsJson: JSON.stringify({ path: 'notes.txt', startLine: 1, endLine: 1 }),
		id: 'call_read_1',
		name: 'read'
	})
	expect(result.content).toBe('Done with the tool result')
})

function createFireworksConfig(): FireworksProviderConfig {
	return {
		apiKey: 'demo-key',
		apiKeyEnv: 'FIREWORKS_API_KEY',
		apiKeySource: 'env',
		baseUrl: 'https://api.fireworks.ai/inference/v1',
		maxTokens: 1024,
		model: 'demo-model',
		promptTruncateLength: 4096,
		providerMode: 'fireworks',
		temperature: 0.4
	}
}

function createFireworksResponse(content: string): Response {
	return new Response(
		JSON.stringify({ choices: [{ message: { content } }], id: 'chatcmpl_demo', model: 'demo-model' }),
		{ headers: { 'Content-Type': 'application/json' }, status: 200 }
	)
}

function createToolCallResponse(toolCall: { argumentsJson: string; id: string; name: string }): Response {
	return new Response(
		JSON.stringify({
			choices: [
				{
					message: {
						content: null,
						role: 'assistant',
						tool_calls: [
							{
								function: { arguments: toolCall.argumentsJson, name: toolCall.name },
								id: toolCall.id,
								type: 'function'
							}
						]
					}
				}
			],
			id: 'chatcmpl_tool',
			model: 'demo-model'
		}),
		{ headers: { 'Content-Type': 'application/json' }, status: 200 }
	)
}

function createToolStreamingFetchMock(): typeof fetch {
	let requestCount = 0

	return ((input: RequestInfo | URL) => {
		if (String(input) !== 'https://api.fireworks.ai/inference/v1/chat/completions') {
			throw new Error(`Unexpected fetch URL in test: ${String(input)}`)
		}

		requestCount += 1
		if (requestCount === 1) {
			return Promise.resolve(
				createFireworksStreamResponse([
					createFireworksToolCallStreamEvent([
						{
							argumentsJson: JSON.stringify({ path: 'notes.txt', startLine: 1, endLine: 1 }),
							id: 'call_read_1',
							name: 'read'
						}
					]),
					{ data: '[DONE]' }
				])
			)
		}

		return Promise.resolve(
			createFireworksStreamResponse([
				createFireworksTextStreamEvent('Done with the tool result', { model: 'demo-model' }),
				{ data: '[DONE]' }
			])
		)
	}) as unknown as typeof fetch
}
