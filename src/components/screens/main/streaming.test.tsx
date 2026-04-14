import { afterEach, expect, test } from 'bun:test'

import {
	cleanupRenderedApp,
	getTestSetup,
	renderApp,
	triggerUiUpdate,
	waitForFrameContent
} from '../../../test/app-test-utils'
import {
	createFireworksStreamResponse,
	createFireworksTextStreamEvent,
	createFireworksToolCallStreamEvent
} from '../../../test/fireworks-stream-test-utils'

const originalFetch = globalThis.fetch

afterEach(() => {
	cleanupRenderedApp()
	globalThis.fetch = originalFetch
})

test('renders the assistant reply incrementally while the stream is still in flight', async () => {
	globalThis.fetch = (() =>
		Promise.resolve(
			createFireworksStreamResponse([
				createFireworksTextStreamEvent('Hello', { delayMs: 5 }),
				createFireworksTextStreamEvent(' there', { delayMs: 90 }),
				{ data: '[DONE]' }
			])
		)) as unknown as typeof fetch

	await renderApp({ providerConfigured: true })

	await triggerUiUpdate(async () => {
		await getTestSetup().mockInput.typeText('Stream this reply')
	})

	await triggerUiUpdate(() => {
		getTestSetup().mockInput.pressEnter()
	})

	const partialFrame = await waitForFrameContent(
		renderedFrame =>
			renderedFrame.includes('Stream this reply') &&
			renderedFrame.includes('Hello') &&
			renderedFrame.includes('responding') &&
			!renderedFrame.includes('Hello there'),
		{ attempts: 24, delayMs: 20 }
	)

	expect(partialFrame).toContain('responding')
	expect(partialFrame).toContain('Hello')
	expect(partialFrame).not.toContain('Hello there')

	const finalFrame = await waitForFrameContent(
		renderedFrame => renderedFrame.includes('Hello there') && !renderedFrame.includes('responding'),
		{ attempts: 24, delayMs: 20 }
	)

	expect(finalFrame).toContain('Hello there')
})

test('shows active tool usage while a streamed tool call is running', async () => {
	globalThis.fetch = createToolActivityFetchMock()

	await renderApp({ providerConfigured: true })

	await triggerUiUpdate(async () => {
		await getTestSetup().mockInput.typeText('Use the fetch tool')
	})

	await triggerUiUpdate(() => {
		getTestSetup().mockInput.pressEnter()
	})

	const toolFrame = await waitForFrameContent(
		renderedFrame =>
			renderedFrame.includes('using tool') &&
			renderedFrame.includes('fetch') &&
			renderedFrame.includes('example.com/docs'),
		{ attempts: 30, delayMs: 20 }
	)

	expect(toolFrame).toContain('using tool')
	expect(toolFrame).toContain('fetch')
	expect(toolFrame).toContain('example.com/docs')

	const finalFrame = await waitForFrameContent(
		renderedFrame => renderedFrame.includes('Tool result is ready') && !renderedFrame.includes('using tool'),
		{ attempts: 30, delayMs: 20 }
	)

	expect(finalFrame).toContain('Tool result is ready')
})

test('pauses for a question tool and resumes after the user answers', async () => {
	const requestBodies: string[] = []
	globalThis.fetch = createQuestionToolFetchMock(requestBodies)

	await renderApp({ providerConfigured: true })
	await submitPrompt('Ask a question before continuing')
	const questionFrame = await waitForQuestionFrame()

	expect(questionFrame).toContain('Pick a mode')
	expect(questionFrame).toContain('Alpha')
	const finalFrame = await answerQuestionAndWaitForReply()
	const toolMessage = getQuestionToolMessageContent(requestBodies)
	expect(toolMessage?.content).toContain('"answer":"alpha"')
	expect(finalFrame).toContain('Mode selected: alpha')
})

function createToolActivityFetchMock(): typeof fetch {
	let chatRequestCount = 0

	return ((input: RequestInfo | URL) => {
		const url = String(input)
		if (url === 'https://example.com/docs') {
			return waitForToolFetch()
		}

		if (url !== 'https://api.fireworks.ai/inference/v1/chat/completions') {
			throw new Error(`Unexpected fetch URL in test: ${url}`)
		}

		chatRequestCount += 1
		return Promise.resolve(chatRequestCount === 1 ? createToolCallStreamResponse() : createToolResultStreamResponse())
	}) as unknown as typeof fetch
}

function createToolCallStreamResponse(): Response {
	return createFireworksStreamResponse([
		createFireworksToolCallStreamEvent([
			{ argumentsJson: JSON.stringify({ url: 'https://example.com/docs' }), id: 'call_fetch_1', name: 'fetch' }
		]),
		{ data: '[DONE]' }
	])
}

function createToolResultStreamResponse(): Response {
	return createFireworksStreamResponse([createFireworksTextStreamEvent('Tool result is ready'), { data: '[DONE]' }])
}

function createQuestionToolCallStreamResponse(): Response {
	return createFireworksStreamResponse([
		createFireworksToolCallStreamEvent([
			{
				argumentsJson: JSON.stringify({
					options: [{ description: 'Use alpha mode', label: 'Alpha', value: 'alpha' }],
					prompt: 'Pick a mode',
					title: 'Question'
				}),
				id: 'call_question_1',
				name: 'question'
			}
		]),
		{ data: '[DONE]' }
	])
}

function createQuestionToolResultStreamResponse(): Response {
	return createFireworksStreamResponse([createFireworksTextStreamEvent('Mode selected: alpha'), { data: '[DONE]' }])
}

function createQuestionToolFetchMock(requestBodies: string[]): typeof fetch {
	return ((input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input)
		if (url !== 'https://api.fireworks.ai/inference/v1/chat/completions') {
			throw new Error(`Unexpected fetch URL in test: ${url}`)
		}

		requestBodies.push(String(init?.body ?? ''))
		return Promise.resolve(
			requestBodies.length === 1 ? createQuestionToolCallStreamResponse() : createQuestionToolResultStreamResponse()
		)
	}) as unknown as typeof fetch
}

async function submitPrompt(message: string): Promise<void> {
	await triggerUiUpdate(async () => {
		await getTestSetup().mockInput.typeText(message)
	})

	await triggerUiUpdate(() => {
		getTestSetup().mockInput.pressEnter()
	})
}

function waitForQuestionFrame(): Promise<string> {
	return waitForFrameContent(
		renderedFrame =>
			renderedFrame.includes('main / question') &&
			renderedFrame.includes('Pick a mode') &&
			renderedFrame.includes('Alpha'),
		{ attempts: 30, delayMs: 20 }
	)
}

async function answerQuestionAndWaitForReply(): Promise<string> {
	await triggerUiUpdate(() => {
		getTestSetup().mockInput.pressEnter()
	})

	return waitForFrameContent(
		renderedFrame => renderedFrame.includes('Mode selected: alpha') && !renderedFrame.includes('Pick a mode'),
		{ attempts: 30, delayMs: 20 }
	)
}

function getQuestionToolMessageContent(requestBodies: string[]): { content?: string; role?: string } | undefined {
	const secondRequestBody = JSON.parse(requestBodies[1] ?? '{}') as {
		messages?: Array<{ content?: string; role?: string }>
	}

	return secondRequestBody.messages?.find(message => message.role === 'tool')
}

function waitForToolFetch(): Promise<Response> {
	return new Promise(resolve => {
		setTimeout(() => {
			resolve(new Response('Fetched documentation', { status: 200 }))
		}, 120)
	})
}
