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

test('opens the selected saved session with Enter and closes the sessions view', async () => {
	await renderApp({
		providerConfigured: true,
		savedConversations: [
			[{ content: 'Older saved prompt', role: 'user' }],
			[{ content: 'Newer saved prompt', role: 'user' }]
		]
	})

	await triggerUiUpdate(() => {
		getTestSetup().mockInput.pressKey('r', { ctrl: true })
	})

	const sessionsFrame = await waitForFrameContent(renderedFrame => renderedFrame.includes('Search sessions'))
	expect(sessionsFrame).toContain('Older saved prompt')
	expect(sessionsFrame).toContain('Newer saved prompt')

	await triggerUiUpdate(() => {
		getTestSetup().mockInput.pressArrow('down')
	})

	await triggerUiUpdate(() => {
		getTestSetup().mockInput.pressEnter()
	})

	const reopenedFrame = await waitForFrameContent(
		renderedFrame => renderedFrame.includes('Older saved prompt') && !renderedFrame.includes('Search sessions')
	)

	expect(reopenedFrame).toContain('Older saved prompt')
	expect(reopenedFrame).not.toContain('Newer saved prompt')
	expect(reopenedFrame).not.toContain('Search sessions')
})

test('uses the configured exit handler when quitting from the main screen', async () => {
	let exitCallCount = 0

	await renderApp({
		onExit: () => {
			exitCallCount += 1
		},
		providerConfigured: true
	})

	await triggerUiUpdate(() => {
		getTestSetup().mockInput.pressEscape()
	})

	expect(exitCallCount).toBe(1)
	expect(getTestSetup().renderer.isDestroyed).toBeFalse()
})
