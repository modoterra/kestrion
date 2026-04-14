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
