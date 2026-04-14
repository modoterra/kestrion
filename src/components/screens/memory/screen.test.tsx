import { afterEach, expect, test } from 'bun:test'

import {
	cleanupRenderedApp,
	getTestSetup,
	renderApp,
	triggerUiUpdate,
	waitForFrameContent
} from '../../../test/app-test-utils'

afterEach(() => {
	cleanupRenderedApp()
})

test('opens the memory view with Ctrl+M and shows saved memory buckets', async () => {
	await renderApp({
		memory: {
			episodic: [{ content: 'Fixed the sessions enter behavior', tags: ['ui'], title: 'Session fix' }],
			longTerm: [
				{ content: 'Always run bun run harness before shipping', tags: ['workflow'], title: 'Ship checklist' }
			],
			scratch: 'Current focus\nPolish the memory screen'
		},
		messages: [{ content: 'Hello there', role: 'user' }],
		providerConfigured: true
	})

	expect(getTestSetup().captureCharFrame()).not.toContain('Search memories')

	await triggerUiUpdate(() => {
		getTestSetup().mockInput.pressKey('m', { ctrl: true })
	})

	const memoryFrame = await waitForFrameContent(renderedFrame => renderedFrame.includes('Search memories'))
	expect(memoryFrame).toContain('main / memory')
	expect(memoryFrame).toContain('Scratch')
	expect(memoryFrame).toContain('Episodic')
	expect(memoryFrame).toContain('Long-term')
	expect(memoryFrame).toContain('Current focus')
})

test('opens a selected memory bucket and renders its saved content', async () => {
	await renderApp({
		memory: {
			episodic: [{ content: 'Fixed the sessions enter behavior', tags: ['ui'], title: 'Session fix' }],
			scratch: 'Current focus\nPolish the memory screen'
		},
		messages: [{ content: 'Hello there', role: 'user' }],
		providerConfigured: true
	})

	await triggerUiUpdate(() => {
		getTestSetup().mockInput.pressKey('m', { ctrl: true })
	})

	await waitForFrameContent(renderedFrame => renderedFrame.includes('Search memories'))

	await triggerUiUpdate(() => {
		getTestSetup().mockInput.pressEnter()
	})

	const scratchFrame = await waitForFrameContent(
		renderedFrame =>
			renderedFrame.includes('main / memory / scratch') && renderedFrame.includes('Polish the memory screen')
	)
	expect(scratchFrame).toContain('Temporary working notes and in-flight context.')
	expect(scratchFrame).toContain('Current focus')

	await triggerUiUpdate(() => {
		getTestSetup().mockInput.pressEscape()
	})

	await waitForFrameContent(renderedFrame => renderedFrame.includes('Search memories'))

	await triggerUiUpdate(async () => {
		await getTestSetup().mockInput.typeText('episodic')
	})

	await triggerUiUpdate(() => {
		getTestSetup().mockInput.pressEnter()
	})

	const episodicFrame = await waitForFrameContent(
		renderedFrame => renderedFrame.includes('main / memory / episodic') && renderedFrame.includes('Session fix')
	)
	expect(episodicFrame).toContain('Fixed the sessions enter behavior')
	expect(episodicFrame).toContain('#ui')
})
