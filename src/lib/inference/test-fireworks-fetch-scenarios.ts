import { readFileSync, writeFileSync } from 'node:fs'

const TEST_FIREWORKS_SCENARIO_FILE_ENV = 'KESTRION_TEST_FIREWORKS_SCENARIO_FILE'

type TestFireworksScenarioEvent = { data: '[DONE]' | Record<string, unknown>; delayMs?: number }
type TestFireworksScenarioResponse =
	| { body: Record<string, unknown>; kind: 'json'; status?: number }
	| { events: TestFireworksScenarioEvent[]; kind: 'stream'; status?: number }

type TestFireworksScenarioState = { requests: string[]; responses: TestFireworksScenarioResponse[] }

export function consumeTestFireworksFetch(init?: RequestInit): Response | null {
	const scenarioFile = process.env[TEST_FIREWORKS_SCENARIO_FILE_ENV]?.trim()
	if (!scenarioFile) {
		return null
	}

	const state = JSON.parse(readFileSync(scenarioFile, 'utf8')) as TestFireworksScenarioState
	const response = state.responses[0]
	if (!response) {
		throw new Error('No Fireworks test scenario responses remain.')
	}

	state.requests.push(String(init?.body ?? ''))
	state.responses = state.responses.length > 1 ? state.responses.slice(1) : state.responses
	writeFileSync(scenarioFile, JSON.stringify(state), 'utf8')

	return response.kind === 'json' ? createJsonResponse(response) : createStreamResponse(response)
}

function createJsonResponse(response: Extract<TestFireworksScenarioResponse, { kind: 'json' }>): Response {
	return new Response(JSON.stringify(response.body), {
		headers: { 'Content-Type': 'application/json' },
		status: response.status ?? 200
	})
}

function createStreamResponse(response: Extract<TestFireworksScenarioResponse, { kind: 'stream' }>): Response {
	const encoder = new TextEncoder()

	return new Response(
		new ReadableStream({
			start(controller): Promise<void> {
				return enqueueStreamEvents(controller, encoder, response.events, 0)
			}
		}),
		{ headers: { 'Content-Type': 'text/event-stream' }, status: response.status ?? 200 }
	)
}

function enqueueStreamEvents(
	controller: ReadableStreamDefaultController<Uint8Array>,
	encoder: TextEncoder,
	events: TestFireworksScenarioEvent[],
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
