import { existsSync, readFileSync, writeFileSync } from 'node:fs'

import type { InferenceRequest } from '../types'

const TEST_RESPONSE_QUEUE_ENV = 'KESTRION_TEST_FIREWORKS_RESPONSE_QUEUE_FILE'

type MockQueueFile = { responses?: unknown }

export function consumeTestFireworksResponse(
	request: InferenceRequest
): { content: string; model: string; provider: string } | null {
	const queueFile = process.env[TEST_RESPONSE_QUEUE_ENV]?.trim()
	if (!queueFile) {
		return null
	}

	if (!existsSync(queueFile)) {
		throw new Error(`Mock Fireworks response queue was not found: ${queueFile}`)
	}

	const responses = readResponseQueue(queueFile)
	const content = responses[0]
	if (!content) {
		throw new Error('Mock Fireworks response queue is empty.')
	}

	writeResponseQueue(queueFile, responses.length > 1 ? responses.slice(1) : responses)
	request.events?.onTextDelta?.(content)

	return { content, model: request.model, provider: 'fireworks' }
}

function readResponseQueue(queueFile: string): string[] {
	const parsed = JSON.parse(readFileSync(queueFile, 'utf8')) as MockQueueFile
	return Array.isArray(parsed.responses)
		? parsed.responses.filter((value): value is string => typeof value === 'string')
		: []
}

function writeResponseQueue(queueFile: string, responses: string[]): void {
	writeFileSync(queueFile, JSON.stringify({ responses }), 'utf8')
}
