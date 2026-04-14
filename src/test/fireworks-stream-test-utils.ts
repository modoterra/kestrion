type FireworksStreamEvent = { data: '[DONE]' | Record<string, unknown>; delayMs?: number }
type FireworksToolCallStreamEvent = { argumentsJson: string; id: string; index?: number; name: string }

export function createFireworksStreamResponse(events: FireworksStreamEvent[]): Response {
	const encoder = new TextEncoder()

	return new Response(
		new ReadableStream({
			start(controller): Promise<void> {
				return enqueueStreamEvents(controller, encoder, events, 0)
			}
		}),
		{ headers: { 'Content-Type': 'text/event-stream' }, status: 200 }
	)
}

export function createFireworksTextStreamEvent(
	content: string,
	options?: { delayMs?: number; id?: string; model?: string }
): FireworksStreamEvent {
	return {
		data: {
			choices: [{ delta: { content }, finish_reason: null }],
			id: options?.id ?? 'chatcmpl_demo',
			model: options?.model ?? 'accounts/fireworks/models/kimi-k2p5'
		},
		delayMs: options?.delayMs
	}
}

export function createFireworksToolCallStreamEvent(
	toolCalls: FireworksToolCallStreamEvent[],
	options?: { delayMs?: number; id?: string; model?: string }
): FireworksStreamEvent {
	return {
		data: {
			choices: [
				{
					delta: {
						tool_calls: toolCalls.map(toolCall => ({
							function: { arguments: toolCall.argumentsJson, name: toolCall.name },
							id: toolCall.id,
							index: toolCall.index ?? 0,
							type: 'function'
						}))
					},
					finish_reason: null
				}
			],
			id: options?.id ?? 'chatcmpl_demo',
			model: options?.model ?? 'accounts/fireworks/models/kimi-k2p5'
		},
		delayMs: options?.delayMs
	}
}

function enqueueStreamEvents(
	controller: ReadableStreamDefaultController<Uint8Array>,
	encoder: TextEncoder,
	events: FireworksStreamEvent[],
	index: number
): Promise<void> {
	const event = events[index]
	if (!event) {
		controller.close()
		return Promise.resolve()
	}

	return waitForDelay(event.delayMs).then(() => {
		const payload = event.data === '[DONE]' ? '[DONE]' : JSON.stringify(event.data)
		controller.enqueue(encoder.encode(`data: ${payload}\n\n`))
		return enqueueStreamEvents(controller, encoder, events, index + 1)
	})
}

function waitForDelay(delayMs: number | undefined): Promise<void> {
	if (!delayMs) {
		return Promise.resolve()
	}

	return new Promise(resolve => {
		setTimeout(resolve, delayMs)
	})
}
