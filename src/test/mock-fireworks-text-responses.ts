import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createFireworksStreamResponse, createFireworksTextStreamEvent } from './fireworks-stream-test-utils'

const TEST_RESPONSE_QUEUE_ENV = 'KESTRION_TEST_FIREWORKS_RESPONSE_QUEUE_FILE'

let activeQueueDirectory: string | null = null

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

	seedWorkerResponseQueue(responses)
}

export function clearMockFireworksTextResponses(): void {
	delete process.env[TEST_RESPONSE_QUEUE_ENV]

	if (!activeQueueDirectory) {
		return
	}

	rmSync(activeQueueDirectory, { force: true, recursive: true })
	activeQueueDirectory = null
}

function seedWorkerResponseQueue(responses: string[]): void {
	clearMockFireworksTextResponses()
	const queueDirectory = mkdtempSync(join(tmpdir(), 'kestrion-fireworks-mock-'))
	const queueFile = join(queueDirectory, 'responses.json')
	writeFileSync(queueFile, JSON.stringify({ responses }), 'utf8')
	process.env[TEST_RESPONSE_QUEUE_ENV] = queueFile
	activeQueueDirectory = queueDirectory
}
