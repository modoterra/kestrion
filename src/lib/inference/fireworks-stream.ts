import type { InferenceEvents } from '../types'
import {
	extractFireworksMessageContent,
	type FireworksContent,
	type FireworksResponseMessage,
	type FireworksToolCall
} from './fireworks-types'

type FireworksStreamChunk = {
	choices?: Array<{ delta?: FireworksStreamDeltaMessage; finish_reason?: string | null }>
	error?: { message?: string }
	id?: string
	model?: string
}

type FireworksStreamDeltaMessage = { content?: FireworksContent | null; tool_calls?: FireworksToolCallDelta[] }
type FireworksToolCallDelta = {
	function?: { arguments?: string; name?: string }
	id?: string
	index?: number
	type?: string
}

type FireworksStreamState = {
	buffer: string
	content: string
	model?: string
	responseId?: string
	toolCalls: Map<number, FireworksToolCall>
}

type FireworksStreamResult = { content: string; id?: string; model?: string; toolCalls: FireworksToolCall[] }

export function createStreamedFireworksMessage(result: FireworksStreamResult): FireworksResponseMessage {
	return { content: result.content || null, role: 'assistant', tool_calls: result.toolCalls }
}

export async function readChatCompletionStream(
	stream: ReadableStream<Uint8Array>,
	events: InferenceEvents | undefined
): Promise<FireworksStreamResult> {
	const state = createFireworksStreamState()
	const finalState = await readNextChunk(stream.getReader(), new TextDecoder(), events, state)

	return {
		content: finalState.content.trim(),
		id: finalState.responseId,
		model: finalState.model,
		toolCalls: [...finalState.toolCalls.values()]
	}
}

function createFireworksStreamState(): FireworksStreamState {
	return { buffer: '', content: '', toolCalls: new Map<number, FireworksToolCall>() }
}

async function readNextChunk(
	reader: ReadableStreamDefaultReader<Uint8Array>,
	decoder: TextDecoder,
	events: InferenceEvents | undefined,
	state: FireworksStreamState
): Promise<FireworksStreamState> {
	const { done, value } = await reader.read()
	state.buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })
	state.buffer = consumeServerSentEvents(state.buffer, data => {
		applyStreamChunk(state, data, events)
	})

	return done ? state : readNextChunk(reader, decoder, events, state)
}

function applyStreamChunk(state: FireworksStreamState, data: string, events: InferenceEvents | undefined): void {
	if (data === '[DONE]') {
		return
	}

	const chunk = JSON.parse(data) as FireworksStreamChunk
	if (chunk.error?.message) {
		throw new Error(chunk.error.message)
	}

	state.responseId = chunk.id ?? state.responseId
	state.model = chunk.model ?? state.model
	for (const choice of chunk.choices ?? []) {
		applyStreamDelta(choice.delta, state, events)
	}
}

function applyStreamDelta(
	delta: FireworksStreamDeltaMessage | undefined,
	state: FireworksStreamState,
	events: InferenceEvents | undefined
): void {
	if (!delta) {
		return
	}

	appendStreamText(state, delta.content, events)
	appendToolCallDeltas(state.toolCalls, delta.tool_calls ?? [])
}

function appendStreamText(
	state: FireworksStreamState,
	content: FireworksContent | null | undefined,
	events: InferenceEvents | undefined
): void {
	const nextText = extractFireworksMessageContent({ content }, { trim: false })
	if (!nextText) {
		return
	}

	state.content += nextText
	events?.onTextDelta?.(nextText)
}

function appendToolCallDeltas(toolCalls: Map<number, FireworksToolCall>, deltas: FireworksToolCallDelta[]): void {
	for (const delta of deltas) {
		mergeToolCallDelta(toolCalls, delta)
	}
}

function consumeServerSentEvents(buffer: string, onData: (data: string) => void): string {
	let remaining = buffer
	let boundaryIndex = findServerSentEventBoundary(remaining)

	while (boundaryIndex >= 0) {
		const eventBlock = remaining.slice(0, boundaryIndex)
		remaining = remaining.slice(boundaryIndex + getBoundaryLength(remaining, boundaryIndex))
		const data = getServerSentEventData(eventBlock)

		if (data) {
			onData(data)
		}

		boundaryIndex = findServerSentEventBoundary(remaining)
	}

	return remaining
}

function getServerSentEventData(eventBlock: string): string {
	return eventBlock
		.split(/\r?\n/)
		.filter(line => line.startsWith('data:'))
		.map(line => line.slice(5).trimStart())
		.join('\n')
}

function findServerSentEventBoundary(value: string): number {
	const unixBoundary = value.indexOf('\n\n')
	const windowsBoundary = value.indexOf('\r\n\r\n')
	if (unixBoundary < 0) {
		return windowsBoundary
	}

	if (windowsBoundary < 0) {
		return unixBoundary
	}

	return Math.min(unixBoundary, windowsBoundary)
}

function getBoundaryLength(value: string, boundaryIndex: number): number {
	return value.startsWith('\r\n\r\n', boundaryIndex) ? 4 : 2
}

function mergeToolCallDelta(toolCalls: Map<number, FireworksToolCall>, delta: FireworksToolCallDelta): void {
	const index = delta.index ?? 0
	const current = toolCalls.get(index) ?? { function: {}, type: 'function' }

	current.id = delta.id ?? current.id
	current.type = delta.type ?? current.type
	current.function = {
		arguments: `${current.function?.arguments ?? ''}${delta.function?.arguments ?? ''}`,
		name: `${current.function?.name ?? ''}${delta.function?.name ?? ''}`
	}

	toolCalls.set(index, current)
}
