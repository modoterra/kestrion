import { afterEach, expect, test } from 'bun:test'

import {
	cleanupRenderedApp,
	getTestSetup,
	renderApp,
	triggerUiUpdate,
	waitForFrameContent
} from '../../../test/app-test-utils'

afterEach(async () => {
	await cleanupRenderedApp()
})

test('renders request failures inline in the conversation transcript', async () => {
	await renderApp({ apiKeyConfigured: false, providerConfigured: true })

	await triggerUiUpdate(async () => {
		await getTestSetup().mockInput.typeText('Try the request anyway')
	})

	await triggerUiUpdate(() => {
		getTestSetup().mockInput.pressEnter()
	})

	const frame = await waitForFrameContent(
		renderedFrame => renderedFrame.includes('Error') && renderedFrame.includes('Try the request anyway'),
		{ attempts: 20, delayMs: 20 }
	)

	expect(frame).toContain('Try the request anyway')
	expect(frame).toContain('Error')
	expect(frame).toContain('!! failed')
})

test('renders missing MATRIX.md failures inline in the conversation transcript', async () => {
	await renderApp({ matrixConfigured: false, providerConfigured: true })

	const frame = await waitForFrameContent(renderedFrame => renderedFrame.includes('Setup MATRIX.md'))

	expect(frame).toContain('Setup MATRIX.md')
	expect(frame).toContain('to define how the agent should behave before you start chatting.')
	expect(frame).toContain('Use ctrl+k and run Setup MATRIX.md to enable the composer.')
	expect(frame).not.toContain('Ask anything...')
})
