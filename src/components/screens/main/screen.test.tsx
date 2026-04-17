import { afterEach, expect, test } from 'bun:test'

import {
	cleanupRenderedApp,
	getTestSetup,
	openCommandPalette,
	renderApp,
	triggerUiUpdate,
	waitForFrameContent
} from '../../../test/app-test-utils'
import {
	clearMockFireworksScenarioResponses,
	mockFireworksScenarioResponses,
	readMockFireworksScenarioRequests
} from '../../../test/mock-fireworks-scenarios'

afterEach(async () => {
	clearMockFireworksScenarioResponses()
	await cleanupRenderedApp()
})

test('opens the tools view with Ctrl+T', async () => {
	await renderApp({ messages: [{ content: 'Hello there', role: 'user' }], providerConfigured: true })

	expect(getTestSetup().captureCharFrame()).not.toContain('Search tools')

	await triggerUiUpdate(() => {
		getTestSetup().mockInput.pressKey('t', { ctrl: true })
	})

	const toolsFrame = await waitForFrameContent(renderedFrame => renderedFrame.includes('Search tools'))
	expect(toolsFrame).toContain('main / tools')
	expect(toolsFrame).toContain('read')
})

test('opens the transcript view with Ctrl+Y', async () => {
	await renderApp({
		providerConfigured: true,
		savedConversations: [
			{
				messages: [
					{ content: 'Trace the worker boundary.', role: 'user' },
					{ content: 'I captured the raw transcript for that turn.', role: 'assistant' }
				],
				workerTranscriptEntries: [
					{
						direction: 'daemonToWorker',
						kind: 'turnInput',
						payloadJson: JSON.stringify({ turnId: 'turn-transcript-open', type: 'turnInput' }),
						sequence: 0,
						turnId: 'turn-transcript-open'
					}
				]
			}
		]
	})

	await triggerUiUpdate(() => {
		getTestSetup().mockInput.pressKey('y', { ctrl: true })
	})

	const transcriptFrame = await waitForFrameContent(renderedFrame => renderedFrame.includes('main / transcript'))
	expect(transcriptFrame).toContain('Daemon / worker wire transcript')
	expect(transcriptFrame).toContain('turnInput')
	expect(transcriptFrame).toContain('daemon -> worker')
})

test('pressing Escape closes the tools view instead of destroying the renderer', async () => {
	await renderApp({ messages: [{ content: 'Hello there', role: 'user' }], providerConfigured: true })

	await triggerUiUpdate(() => {
		getTestSetup().mockInput.pressKey('t', { ctrl: true })
	})

	await waitForFrameContent(renderedFrame => renderedFrame.includes('Search tools'))

	await triggerUiUpdate(() => {
		getTestSetup().mockInput.pressEscape()
	})

	const closedFrame = await waitForFrameContent(
		renderedFrame => renderedFrame.includes('Ask anything...') && !renderedFrame.includes('Search tools')
	)

	expect(closedFrame).not.toContain('Search tools')
	expect(getTestSetup().renderer.isDestroyed).toBeFalse()
})

test('pressing Escape from a tool detail view returns to the tools list', async () => {
	await renderApp({ messages: [{ content: 'Hello there', role: 'user' }], providerConfigured: true })

	await triggerUiUpdate(() => {
		getTestSetup().mockInput.pressKey('t', { ctrl: true })
	})

	await waitForFrameContent(renderedFrame => renderedFrame.includes('Search tools'))

	await triggerUiUpdate(async () => {
		await getTestSetup().mockInput.typeText('read')
	})

	await triggerUiUpdate(() => {
		getTestSetup().mockInput.pressEnter()
	})

	await waitForFrameContent(
		renderedFrame => renderedFrame.includes('main / tools / read') && renderedFrame.includes('Parameters')
	)

	await triggerUiUpdate(() => {
		getTestSetup().mockInput.pressEscape()
	})

	const toolsFrame = await waitForFrameContent(
		renderedFrame => renderedFrame.includes('Search tools') && !renderedFrame.includes('main / tools / read')
	)

	expect(toolsFrame).toContain('main / tools')
	expect(toolsFrame).toContain('read')
})

test('shows an empty transcript state when the active conversation has no worker turns', async () => {
	await renderApp({ providerConfigured: true })

	await triggerUiUpdate(() => {
		getTestSetup().mockInput.pressKey('y', { ctrl: true })
	})

	const transcriptFrame = await waitForFrameContent(renderedFrame =>
		renderedFrame.includes('No daemon-worker transcript yet.')
	)
	expect(transcriptFrame).toContain('No daemon-worker transcript yet.')
})

test('scrolls the transcript view with arrow keys', async () => {
	await renderApp({
		height: 18,
		providerConfigured: true,
		savedConversations: [
			{
				messages: [
					{ content: 'Show me the worker transcript.', role: 'user' },
					{ content: 'The transcript view should scroll.', role: 'assistant' }
				],
				workerTranscriptEntries: Array.from({ length: 8 }, (_, index) => ({
					direction: index % 2 === 0 ? 'daemonToWorker' : 'workerToDaemon',
					kind: index % 2 === 0 ? 'turnInput' : 'workerEvent',
					payloadJson: JSON.stringify({
						index,
						message: `seed transcript entry ${index + 1}`,
						type: index % 2 === 0 ? 'turnInput' : 'event'
					}),
					sequence: index,
					turnId: `turn-scroll-${String(index + 1).padStart(2, '0')}`
				}))
			}
		]
	})

	await triggerUiUpdate(() => {
		getTestSetup().mockInput.pressKey('y', { ctrl: true })
	})

	const initialFrame = await waitForFrameContent(renderedFrame => renderedFrame.includes('main / transcript'))
	expect(initialFrame).toContain('seed transcript entry 8')
	expect(initialFrame).not.toContain('turn-scroll-01')

	await triggerUiUpdate(() => {
		for (let index = 0; index < 120; index += 1) {
			getTestSetup().mockInput.pressArrow('up')
		}
	})

	const scrolledFrame = await waitForFrameContent(renderedFrame => renderedFrame.includes('turn-scroll-01'))
	expect(scrolledFrame).toContain('turn-scroll-01')
})

test('opens the MATRIX setup wizard from the command palette', async () => {
	await renderApp({ matrixConfigured: false, providerConfigured: true })

	const paletteFrame = await openCommandPalette()
	expect(paletteFrame).toContain('Setup MATRIX.md')

	await triggerUiUpdate(async () => {
		await getTestSetup().mockInput.typeText('matrix')
	})

	await triggerUiUpdate(() => {
		getTestSetup().mockInput.pressEnter()
	})

	const wizardFrame = await waitForFrameContent(renderedFrame => renderedFrame.includes('main / settings / matrix'))
	expect(wizardFrame).toContain('settings / matrix')
	expect(wizardFrame).toContain('Personality')
	expect(wizardFrame).toContain('mode')
})

test('saving MATRIX.md from the wizard enables the composer immediately', async () => {
	await renderApp({ matrixConfigured: false, providerConfigured: true })

	const blockedFrame = await waitForFrameContent(renderedFrame => renderedFrame.includes('to enable the composer.'))
	expect(blockedFrame).toContain('Setup MATRIX.md')
	expect(blockedFrame).not.toContain('Ask anything...')

	await openMatrixSetupWizard()

	await triggerUiUpdate(() => {
		getTestSetup().mockInput.pressKey('s', { ctrl: true })
	})

	const previewFrame = await waitForFrameContent(renderedFrame => renderedFrame.includes('## Role'))
	expect(previewFrame).toContain('# MATRIX')
	expect(previewFrame).toContain('MATRIX.md will be created at')

	await triggerUiUpdate(() => {
		getTestSetup().mockInput.pressKey('s', { ctrl: true })
	})

	const savedFrame = await waitForFrameContent(
		renderedFrame =>
			renderedFrame.includes('Ask anything...') &&
			renderedFrame.includes('MATRIX.md saved. New conversations use it immediately.')
	)
	expect(savedFrame).toContain('Ask anything...')
	expect(savedFrame).not.toContain('to enable the composer.')
})

test('shows an overwrite warning when previewing an existing MATRIX.md', async () => {
	await renderApp({ matrixConfigured: true, providerConfigured: true })

	await openMatrixSetupWizard()

	await triggerUiUpdate(() => {
		getTestSetup().mockInput.pressKey('s', { ctrl: true })
	})

	const previewFrame = await waitForFrameContent(renderedFrame =>
		renderedFrame.includes('Existing MATRIX.md will be replaced at')
	)
	expect(previewFrame).toContain('Existing MATRIX.md will be replaced at')
	expect(previewFrame).toContain('# MATRIX')
	expect(previewFrame).toContain('## Role')
})

test('runs compact conversation from the command palette', async () => {
	mockFireworksScenarioResponses([
		{
			body: {
				choices: [{ message: { content: 'Checkpoint summary from the command palette.' } }],
				id: 'chatcmpl_ui_compaction',
				model: 'accounts/fireworks/models/kimi-k2p5'
			},
			kind: 'json'
		}
	])

	await renderApp({
		providerConfigured: true,
		savedConversations: [
			{
				messages: [
					{ content: 'Turn 1 request', role: 'user' },
					{ content: 'Turn 1 reply', role: 'assistant' },
					{ content: 'Turn 2 request', role: 'user' },
					{ content: 'Turn 2 reply', role: 'assistant' },
					{ content: 'Turn 3 request', role: 'user' },
					{ content: 'Turn 3 reply', role: 'assistant' },
					{ content: 'Turn 4 request', role: 'user' },
					{ content: 'Turn 4 reply', role: 'assistant' },
					{ content: 'Turn 5 request', role: 'user' },
					{ content: 'Turn 5 reply', role: 'assistant' }
				]
			}
		]
	})

	const paletteFrame = await openCommandPalette()
	expect(paletteFrame).toContain('Compact conversation')

	await triggerUiUpdate(async () => {
		await getTestSetup().mockInput.typeText('compact')
	})

	await triggerUiUpdate(() => {
		getTestSetup().mockInput.pressEnter()
	})

	const compactedFrame = await waitForFrameContent(renderedFrame =>
		renderedFrame.includes('Conversation compacted for future replies.')
	)
	expect(compactedFrame).toContain('Conversation compacted for future replies.')
	expect(compactedFrame).toContain('ctx')
	expect(readMockFireworksScenarioRequests()).toHaveLength(1)
})

async function openMatrixSetupWizard(): Promise<string> {
	await openCommandPalette()

	await triggerUiUpdate(async () => {
		await getTestSetup().mockInput.typeText('matrix')
	})

	await triggerUiUpdate(() => {
		getTestSetup().mockInput.pressEnter()
	})

	return waitForFrameContent(renderedFrame => renderedFrame.includes('main / settings / matrix'))
}
