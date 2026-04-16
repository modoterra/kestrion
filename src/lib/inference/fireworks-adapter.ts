import type { FireworksProviderConfig } from '../config'
import { executeToolCall, getToolDefinitions } from '../tools'
import type { ToolExecutionContext } from '../tools/tool-types'
import type { InferenceEvents, InferenceMessage, InferenceRequest, InferenceResult, InferenceToolCall } from '../types'
import { createStreamedFireworksMessage, readChatCompletionStream } from './fireworks-stream'
import {
	extractFireworksMessageContent,
	type FireworksRequestMessage,
	type FireworksResponseMessage,
	type FireworksToolCall
} from './fireworks-types'
import { consumeTestFireworksFetch } from './test-fireworks-fetch-scenarios'
import { consumeTestFireworksResponse } from './test-fireworks-response-queue'
import type { InferenceAdapter } from './types'

const MAX_TOOL_ROUND_TRIPS = 4
const TEST_TOOL_CALL_DELAY_ENV = 'KESTRION_TEST_TOOL_CALL_DELAY_MS'

type FireworksResponse = {
	choices?: Array<{ message?: FireworksResponseMessage }>
	error?: { message?: string }
	id?: string
	model?: string
}

export class FireworksAdapter implements InferenceAdapter {
	readonly id = 'fireworks'
	readonly label = 'Fireworks AI'

	constructor(
		private readonly config: FireworksProviderConfig,
		private readonly configFile: string,
		private readonly workspaceRoot = process.cwd(),
		private readonly toolContext: ToolExecutionContext = {}
	) {}

	async complete(request: InferenceRequest): Promise<InferenceResult> {
		const testResponse = consumeTestFireworksResponse(request)
		if (testResponse) {
			return testResponse
		}

		if (!this.config.apiKey) {
			throw new Error(`Missing Fireworks API key. Set ${this.config.apiKeyEnv} or update ${this.configFile}.`)
		}

		const { content, payload } = await this.completeWithTools(
			request,
			request.messages.map(message => toFireworksMessage(message))
		)

		return { content, id: payload.id, model: payload.model ?? request.model, provider: this.id, raw: payload }
	}

	private completeWithTools(
		request: InferenceRequest,
		initialMessages: FireworksRequestMessage[]
	): Promise<{ content: string; payload: FireworksResponse }> {
		return this.completeWithToolsAttempt(request, [...initialMessages], true, MAX_TOOL_ROUND_TRIPS)
	}

	private async completeWithToolsAttempt(
		request: InferenceRequest,
		messages: FireworksRequestMessage[],
		allowTools: boolean,
		attemptsRemaining: number
	): Promise<{ content: string; payload: FireworksResponse }> {
		const response = hasInferenceEvents(request.events)
			? await this.requestStreamingCompletion(request, messages, allowTools)
			: await this.requestCompletion(request, messages, allowTools)
		const message = response.message
		const toolsEnabled = response.toolsEnabled
		const toolCalls = toolsEnabled ? getFunctionToolCalls(message) : []

		if (toolCalls.length > 0) {
			if (attemptsRemaining <= 0) {
				throw new Error('Fireworks exceeded the tool call limit.')
			}

			const toolResultMessages = await executeToolCallsWithEvents(
				toolCalls,
				{ ...this.toolContext, workspaceRoot: this.toolContext.workspaceRoot ?? this.workspaceRoot },
				request.events
			)
			const nextMessages = [...messages, toAssistantToolCallMessage(message, toolCalls), ...toolResultMessages]

			return this.completeWithToolsAttempt(request, nextMessages, toolsEnabled, attemptsRemaining - 1)
		}

		const content = extractFireworksMessageContent(message)
		if (!content) {
			throw new Error('Fireworks returned an empty assistant message.')
		}

		return { content, payload: response.payload }
	}

	private async requestCompletion(
		request: InferenceRequest,
		messages: FireworksRequestMessage[],
		allowTools: boolean
	): Promise<{ message: FireworksResponseMessage; payload: FireworksResponse; toolsEnabled: boolean }> {
		const requestInit = {
			body: JSON.stringify({
				max_tokens: request.maxTokens,
				messages,
				model: request.model,
				prompt_truncate_len: request.promptTruncateLength,
				...(request.reasoningEffort ? { reasoning_effort: request.reasoningEffort } : {}),
				stream: false,
				temperature: request.temperature,
				...(request.topP !== undefined ? { top_p: request.topP } : {}),
				...(allowTools ? { tool_choice: 'auto', tools: getToolDefinitions(this.toolContext.toolRegistry) } : {})
			}),
			headers: { Authorization: `Bearer ${this.config.apiKey}`, 'Content-Type': 'application/json' },
			method: 'POST',
			signal: request.signal
		} satisfies RequestInit
		const response =
			(await consumeTestFireworksFetch(requestInit)) ??
			(await fetch(`${this.config.baseUrl}/chat/completions`, requestInit))

		const payload = (await response.json()) as FireworksResponse

		if (response.ok) {
			return { message: getFirstResponseMessage(payload), payload, toolsEnabled: allowTools }
		}

		const errorMessage = payload.error?.message ?? `Fireworks request failed with status ${response.status}.`
		if (allowTools && shouldRetryWithoutTools(errorMessage)) {
			return this.requestCompletion(request, messages, false)
		}

		throw new Error(errorMessage)
	}

	private async requestStreamingCompletion(
		request: InferenceRequest,
		messages: FireworksRequestMessage[],
		allowTools: boolean
	): Promise<{ message: FireworksResponseMessage; payload: FireworksResponse; toolsEnabled: boolean }> {
		const requestInit = {
			body: JSON.stringify({
				max_tokens: request.maxTokens,
				messages,
				model: request.model,
				prompt_truncate_len: request.promptTruncateLength,
				...(request.reasoningEffort ? { reasoning_effort: request.reasoningEffort } : {}),
				stream: true,
				temperature: request.temperature,
				...(request.topP !== undefined ? { top_p: request.topP } : {}),
				...(allowTools ? { tool_choice: 'auto', tools: getToolDefinitions(this.toolContext.toolRegistry) } : {})
			}),
			headers: { Authorization: `Bearer ${this.config.apiKey}`, 'Content-Type': 'application/json' },
			method: 'POST',
			signal: request.signal
		} satisfies RequestInit
		const response =
			(await consumeTestFireworksFetch(requestInit)) ??
			(await fetch(`${this.config.baseUrl}/chat/completions`, requestInit))

		if (!response.ok) {
			const payload = (await response.json()) as FireworksResponse
			const errorMessage = payload.error?.message ?? `Fireworks request failed with status ${response.status}.`
			if (allowTools && shouldRetryWithoutTools(errorMessage)) {
				return this.requestStreamingCompletion(request, messages, false)
			}

			throw new Error(errorMessage)
		}

		if (!response.body) {
			throw new Error('Fireworks returned no stream body.')
		}

		const streamedResponse = await readChatCompletionStream(response.body, request.events)
		const message = createStreamedFireworksMessage(streamedResponse)
		const payload: FireworksResponse = {
			choices: [{ message }],
			id: streamedResponse.id,
			model: streamedResponse.model ?? request.model
		}

		return { message, payload, toolsEnabled: allowTools }
	}
}

function getFirstResponseMessage(payload: FireworksResponse): FireworksResponseMessage {
	const message = payload.choices?.[0]?.message
	if (!message) {
		throw new Error('Fireworks returned no assistant message.')
	}

	return message
}

function getFunctionToolCalls(message: FireworksResponseMessage): FireworksToolCall[] {
	return (message.tool_calls ?? []).filter(toolCall => isFunctionToolCall(toolCall))
}

function isFunctionToolCall(toolCall: FireworksToolCall): boolean {
	return toolCall.type === 'function' && typeof toolCall.id === 'string' && !!toolCall.function?.name
}

function shouldRetryWithoutTools(errorMessage: string): boolean {
	return (
		/tool|function call|tool_choice/i.test(errorMessage) &&
		/unsupported|not support|unknown|invalid/i.test(errorMessage)
	)
}

function toAssistantToolCallMessage(
	message: FireworksResponseMessage,
	toolCalls: FireworksToolCall[]
): FireworksRequestMessage {
	return { content: message.content ?? null, role: 'assistant', tool_calls: toolCalls }
}

function toFireworksMessage(message: InferenceMessage): FireworksRequestMessage {
	return { content: message.content, role: message.role }
}

async function executeToolCallsWithEvents(
	toolCalls: FireworksToolCall[],
	context: ToolExecutionContext,
	events: InferenceEvents | undefined
): Promise<FireworksRequestMessage[]> {
	const inferenceToolCalls = toolCalls.map(toolCall => toInferenceToolCall(toolCall))
	events?.onToolCallsStart?.(inferenceToolCalls)

	try {
		await waitForTestToolDelay()
		return await Promise.all(toolCalls.map(toolCall => toToolResultMessage(toolCall, context)))
	} finally {
		events?.onToolCallsFinish?.(inferenceToolCalls)
	}
}

async function toToolResultMessage(
	toolCall: FireworksToolCall,
	context: ToolExecutionContext
): Promise<FireworksRequestMessage> {
	const functionName = toolCall.function?.name ?? ''
	const argumentsJson = toolCall.function?.arguments ?? '{}'
	const toolCallId = toolCall.id

	if (!toolCallId) {
		throw new Error('Fireworks returned a tool call without an id.')
	}

	return {
		content: await executeToolCall(functionName, argumentsJson, context),
		role: 'tool',
		tool_call_id: toolCallId
	}
}

function hasInferenceEvents(events: InferenceEvents | undefined): boolean {
	return Boolean(events?.onTextDelta || events?.onToolCallsFinish || events?.onToolCallsStart)
}

function toInferenceToolCall(toolCall: FireworksToolCall): InferenceToolCall {
	return {
		argumentsJson: toolCall.function?.arguments ?? '{}',
		id: toolCall.id ?? '',
		name: toolCall.function?.name ?? ''
	}
}

function waitForTestToolDelay(): Promise<void> {
	const delayMs = Number.parseInt(process.env[TEST_TOOL_CALL_DELAY_ENV] ?? '', 10)
	if (!Number.isFinite(delayMs) || delayMs <= 0) {
		return Promise.resolve()
	}

	return new Promise(resolve => {
		setTimeout(resolve, delayMs)
	})
}
