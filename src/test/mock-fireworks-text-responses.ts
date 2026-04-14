import { createFireworksStreamResponse, createFireworksTextStreamEvent } from './fireworks-stream-test-utils'

export function mockFireworksTextResponses(responses: string[]): void {
	let responseIndex = 0

	globalThis.fetch = (() => {
		const content = responses[responseIndex] ?? responses.at(-1) ?? ''
		responseIndex += 1

		return Promise.resolve(
			createFireworksStreamResponse([
				createFireworksTextStreamEvent(content, {
					id: `chatcmpl_${responseIndex}`,
					model: 'accounts/fireworks/models/kimi-k2p5'
				}),
				{ data: '[DONE]' }
			])
		)
	}) as unknown as typeof fetch
}
