import { afterEach, expect, test } from 'bun:test'

import {
	cleanupRenderedApp,
	getTestSetup,
	renderApp,
	triggerUiUpdate,
	waitForFrameContent
} from '../../../test/app-test-utils'
import {
	createFireworksTextStreamEvent,
	createFireworksToolCallStreamEvent
} from '../../../test/fireworks-stream-test-utils'
import {
	clearMockFireworksScenarioResponses,
	mockFireworksScenarioResponses
} from '../../../test/mock-fireworks-scenarios'

afterEach(async () => {
	await cleanupRenderedApp()
	clearMockFireworksScenarioResponses()
	delete process.env.KESTRION_TEST_TOOL_CALL_DELAY_MS
})

test('renders the assistant reply incrementally while the stream is still in flight', async () => {
	mockFireworksScenarioResponses([createIncrementalReplyScenario()])

	await renderApp({ providerConfigured: true })
	await submitPrompt('Stream this reply')

	const partialFrame = await waitForFrameContent(
		renderedFrame =>
			renderedFrame.includes('Stream this reply') &&
			renderedFrame.includes('Hello') &&
			renderedFrame.includes('responding') &&
			containsBrailleMicroSpinner(renderedFrame) &&
			renderedFrame.includes('streaming') &&
			!renderedFrame.includes('Hello there'),
		{ attempts: 36, delayMs: 20 }
	)

	expect(partialFrame).toContain('responding')
	expect(containsBrailleMicroSpinner(partialFrame)).toBeTrue()
	expect(partialFrame).toContain('Hello')
	expect(partialFrame).toContain('streaming')
	expect(partialFrame).not.toContain('Hello there')

	const finalFrame = await waitForFrameContent(
		renderedFrame => renderedFrame.includes('Hello there') && !renderedFrame.includes('responding'),
		{ attempts: 48, delayMs: 20 }
	)

	expect(finalFrame).toContain('Hello there')
})

test('shows a waiting turn rail before the first provider delta arrives', async () => {
	mockFireworksScenarioResponses([createDelayedReplyScenario()])

	await renderApp({ providerConfigured: true })
	await submitPrompt('Wait for the first token')

	const waitingFrame = await waitForFrameContent(
		renderedFrame =>
			renderedFrame.includes('Ask anything...') &&
			renderedFrame.includes('waiting 00:00') &&
			containsBrailleMicroSpinner(renderedFrame) &&
			!renderedFrame.includes('waiting for the provider response'),
		{ attempts: 24, delayMs: 20 }
	)

	expect(waitingFrame).toContain('waiting 00:00')
	expect(containsBrailleMicroSpinner(waitingFrame)).toBeTrue()
	expect(waitingFrame).not.toContain('waiting for the provider response')

	const finalFrame = await waitForFrameContent(renderedFrame => renderedFrame.includes('Finally here'), {
		attempts: 48,
		delayMs: 20
	})
	expect(finalFrame).toContain('Finally here')
	expect(finalFrame).toContain('v done')
})

test('keeps context metrics visible after a completed reply without showing provider status copy', async () => {
	mockFireworksScenarioResponses([createDelayedReplyScenario()])

	await renderApp({ providerConfigured: true })
	await submitPrompt('Finish the reply cleanly')

	const finalFrame = await waitForFrameContent(renderedFrame => renderedFrame.includes('Finally here'), {
		attempts: 48,
		delayMs: 20
	})

	expect(finalFrame).toContain('ctx')
	expect(finalFrame).toContain('v done')
	expect(finalFrame).not.toContain('Fireworks AI replied.')
})

test('shows active tool usage while a streamed tool call is running', async () => {
	process.env.KESTRION_TEST_TOOL_CALL_DELAY_MS = '250'
	mockFireworksScenarioResponses(createToolActivityScenarios())

	await renderApp({ providerConfigured: true })
	await submitPrompt('Write a file for me')

	const toolFrame = await waitForFrameContent(
		renderedFrame =>
			renderedFrame.includes('waiting 00:00') &&
			containsBrailleMicroSpinner(renderedFrame) &&
			renderedFrame.includes('tool call') &&
			renderedFrame.includes('write') &&
			renderedFrame.includes('notes.txt'),
		{ attempts: 30, delayMs: 20 }
	)

	expect(toolFrame).toContain('waiting 00:00')
	expect(containsBrailleMicroSpinner(toolFrame)).toBeTrue()
	expect(toolFrame).toContain('tool call')
	expect(toolFrame).toContain('write')
	expect(toolFrame).toContain('notes.txt')
	expect(toolFrame).not.toContain('tooling')

	const finalFrame = await waitForFrameContent(
		renderedFrame =>
			renderedFrame.includes('Tool result is ready') &&
			renderedFrame.includes('used tool') &&
			renderedFrame.includes('write') &&
			renderedFrame.includes('notes.txt'),
		{ attempts: 30, delayMs: 20 }
	)

	expect(finalFrame).toContain('Tool result is ready')
	expect(finalFrame).toContain('used tool')
	expect(finalFrame).toContain('write')
	expect(finalFrame).toContain('notes.txt')
	expect(finalFrame).toContain('v done')
	expect(finalFrame).toContain('ready')
})

test('updates the transcript screen live while a turn is running', async () => {
	mockFireworksScenarioResponses([createIncrementalReplyScenario()])

	await renderApp({ providerConfigured: true })
	await submitPrompt('Show me the wire transcript')

	await triggerUiUpdate(() => {
		getTestSetup().mockInput.pressKey('y', { ctrl: true })
	})

	const liveTranscriptFrame = await waitForFrameContent(
		renderedFrame => renderedFrame.includes('main / transcript') && renderedFrame.includes('workerEvent'),
		{ attempts: 48, delayMs: 20 }
	)

	expect(liveTranscriptFrame).toContain('worker -> daemon')
	expect(liveTranscriptFrame).toContain('workerEvent')
	expect(liveTranscriptFrame).toContain('"turnId"')

	const finalFrame = await waitForFrameContent(renderedFrame => renderedFrame.includes('Hello there'), {
		attempts: 48,
		delayMs: 20
	})
	expect(finalFrame).toContain('Hello there')
})

test('prompts for approval when a tool call is denied by policy and resumes after approving once', async () => {
	mockFireworksScenarioResponses(createApprovalPromptScenarios())

	await renderApp({
		configureToolPolicy: policy => ({
			...policy,
			tools: { ...policy.tools, remember: { allowedMemoryKinds: ['scratch'] } }
		}),
		providerConfigured: true
	})

	await submitPrompt('Remember the archive plan')

	const approvalFrame = await waitForFrameContent(
		renderedFrame =>
			renderedFrame.includes('Approve remember?') &&
			renderedFrame.includes('long-term') &&
			renderedFrame.includes('Yes, this once'),
		{ attempts: 48, delayMs: 20 }
	)

	expect(approvalFrame).toContain('Memory kind "long-term" is denied by policy')
	expect(approvalFrame).toContain('Write to long-term memory.')
	expect(approvalFrame).toContain('Yes, this once')
	expect(approvalFrame).toContain('Choose "Other..." and type an explanation')

	await triggerUiUpdate(() => {
		getTestSetup().mockInput.pressEnter()
	})

	const finalFrame = await waitForFrameContent(
		renderedFrame => renderedFrame.includes('Stored after approval.') && !renderedFrame.includes('Approve remember?'),
		{ attempts: 48, delayMs: 20 }
	)

	expect(finalFrame).toContain('Stored after approval.')
})

function createDelayedReplyScenario(): {
	events: Array<{ data: '[DONE]' | Record<string, unknown>; delayMs?: number }>
	kind: 'stream'
} {
	return {
		events: [createFireworksTextStreamEvent('Finally here', { delayMs: 500 }), { data: '[DONE]' }],
		kind: 'stream'
	}
}

function createIncrementalReplyScenario(): {
	events: Array<{ data: '[DONE]' | Record<string, unknown>; delayMs?: number }>
	kind: 'stream'
} {
	return {
		events: [
			createFireworksTextStreamEvent('Hello', { delayMs: 5 }),
			createFireworksTextStreamEvent(' there', { delayMs: 400 }),
			{ data: '[DONE]' }
		],
		kind: 'stream'
	}
}

function createToolActivityScenarios(): Array<{
	events: Array<{ data: '[DONE]' | Record<string, unknown>; delayMs?: number }>
	kind: 'stream'
}> {
	return [
		{
			events: [
				createFireworksToolCallStreamEvent([
					{
						argumentsJson: JSON.stringify({ content: 'Sandboxed write', path: 'notes.txt' }),
						id: 'call_write_1',
						name: 'write'
					}
				]),
				{ data: '[DONE]' }
			],
			kind: 'stream'
		},
		{ events: [createFireworksTextStreamEvent('Tool result is ready'), { data: '[DONE]' }], kind: 'stream' }
	]
}

function containsBrailleMicroSpinner(frame: string): boolean {
	return /[⠁⠂⠄⡀⢀⠠⠐⠈]/.test(frame)
}

function createApprovalPromptScenarios(): Array<{
	events: Array<{ data: '[DONE]' | Record<string, unknown>; delayMs?: number }>
	kind: 'stream'
}> {
	return [
		{
			events: [
				createFireworksToolCallStreamEvent([
					{
						argumentsJson: JSON.stringify({
							action: 'write',
							content: 'Remember the archive plan',
							memory: 'long-term',
							title: 'Archive plan'
						}),
						id: 'call_remember_approval',
						name: 'remember'
					}
				]),
				{ data: '[DONE]' }
			],
			kind: 'stream'
		},
		{ events: [createFireworksTextStreamEvent('Stored after approval.'), { data: '[DONE]' }], kind: 'stream' }
	]
}

async function submitPrompt(message: string): Promise<void> {
	await triggerUiUpdate(async () => {
		await getTestSetup().mockInput.typeText(message)
	})

	await triggerUiUpdate(() => {
		getTestSetup().mockInput.pressEnter()
	})
}
