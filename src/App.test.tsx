import { afterEach, expect, test } from 'bun:test'

import {
	cleanupRenderedApp,
	getTestSetup,
	openCommandPalette,
	renderApp,
	reopenCurrentSessionFromOverlay,
	settleUi,
	submitComposerMessageAndWaitForReply,
	triggerUiUpdate,
	waitForFrameContent
} from './test/app-test-utils'
import { findLineIndex, findLineStart, tailLines } from './test/frame-test-utils'
import { mockFireworksTextResponses } from './test/mock-fireworks-text-responses'

const originalFetch = globalThis.fetch

afterEach(() => {
	cleanupRenderedApp()
	globalThis.fetch = originalFetch
})

test('starts in a new empty conversation when a provider is configured', async () => {
	await renderApp({ providerConfigured: true })

	const frame = getTestSetup().captureCharFrame()
	const composerLine = findLineIndex(frame, 'Ask anything...')
	const versionLine = findLineIndex(frame, 'v1.33.4 (test)')
	const tail = tailLines(frame, 4)

	expect(versionLine).toBeGreaterThanOrEqual(0)
	expect(versionLine).toBeLessThan(6)
	expect(composerLine).toBeGreaterThan(30)
	expect(tail).toContain('ctrl+r sessions')
	expect(frame).not.toContain('Ask anything... "Fix a TODO in the codebase"')
	expect(frame).not.toContain('Ask the agent anything...')
})

test('does not create a saved session before the first message', async () => {
	await renderApp({ providerConfigured: true })

	await triggerUiUpdate(() => {
		getTestSetup().mockInput.pressKey('r', { ctrl: true })
	})

	expect(getTestSetup().captureCharFrame()).toContain('No results found')
	expect(getTestSetup().captureCharFrame()).not.toContain('Fresh session')
})

test('shows the normal conversation state after saving a provider even without an API key', async () => {
	await renderApp({ apiKeyConfigured: false, providerConfigured: true })

	const frame = getTestSetup().captureCharFrame()

	expect(frame).toContain('Ask anything...')
	expect(frame).not.toContain('Configure an inference provider')
})

test('disables the composer and shows provider setup guidance when missing', async () => {
	await renderApp({ providerConfigured: false })

	const frame = getTestSetup().captureCharFrame()

	expect(frame).toContain('Configure an inference provider')
	expect(frame).toContain('to connect to a model and start a conversation.')
	expect(frame).toContain('Use ctrl+p to setup a provider.')
	expect(frame).not.toContain('Ask anything...')
})

test('keeps the composer at the bottom once a conversation starts', async () => {
	await renderApp({ messages: [{ content: 'Hello there', role: 'user' }], providerConfigured: true })

	const frame = getTestSetup().captureCharFrame()
	const composerLine = findLineIndex(frame, 'Ask anything...')

	expect(composerLine).toBeGreaterThan(28)
	expect(frame).toContain('Hello there')
})

test('submits the composer with Enter and saves the exchange', async () => {
	mockFireworksTextResponses(['Hello from Fireworks'])

	await renderApp({ providerConfigured: true })

	await triggerUiUpdate(async () => {
		await getTestSetup().mockInput.typeText('Ship it')
	})

	await triggerUiUpdate(() => {
		getTestSetup().mockInput.pressEnter()
	})

	await settleUi()
	await settleUi()

	const frame = await waitForFrameContent(renderedFrame => renderedFrame.includes('Hello from Fireworks'))
	expect(frame).toContain('Ship it')
	expect(frame).toContain('Hello from Fireworks')
})

test('submits a second Enter press after the first fresh-conversation reply', async () => {
	mockFireworksTextResponses(['Reply 1', 'Reply 2'])

	await renderApp({ providerConfigured: true })

	const firstReplyFrame = await submitComposerMessageAndWaitForReply('First prompt', 'Reply 1')
	expect(firstReplyFrame).toContain('First prompt')
	expect(firstReplyFrame).toContain('Reply 1')

	const secondReplyFrame = await submitComposerMessageAndWaitForReply('Second prompt', 'Reply 2')
	expect(secondReplyFrame).toContain('Second prompt')
	expect(secondReplyFrame).toContain('Reply 2')
})

test('keeps the composer ready after reopening a saved conversation and after each reply', async () => {
	mockFireworksTextResponses(['Reply 1', 'Reply 2'])

	await renderApp({
		messages: [
			{ content: 'Existing prompt', role: 'user' },
			{ content: 'Existing reply', role: 'assistant' }
		],
		providerConfigured: true
	})

	await reopenCurrentSessionFromOverlay()

	const firstReplyFrame = await submitComposerMessageAndWaitForReply('First follow-up', 'Reply 1')
	expect(firstReplyFrame).toContain('First follow-up')

	const secondReplyFrame = await submitComposerMessageAndWaitForReply('Second follow-up', 'Reply 2')
	expect(secondReplyFrame).toContain('Second follow-up')
})

test('renders assistant content left and user prompt cards right', async () => {
	await renderApp({
		messages: [
			{ content: 'assistant speaks from the left', role: 'assistant' },
			{ content: 'user prompt on the right', role: 'user' }
		],
		providerConfigured: true
	})

	const frame = await waitForFrameContent(renderedFrame => renderedFrame.includes('assistant speaks from the left'))
	const assistantColumn = findLineStart(frame, 'assistant speaks from the left')
	const userColumn = findLineStart(frame, 'user prompt on the right')

	expect(assistantColumn).toBeGreaterThanOrEqual(0)
	expect(userColumn).toBeGreaterThan(assistantColumn)
})

test('renders assistant markdown without showing raw markdown markers', async () => {
	await renderApp({
		messages: [{ content: '## Ship Plan\n\n- Verify the fix\n- Run `bun run harness`', role: 'assistant' }],
		providerConfigured: true
	})

	const frame = await waitForFrameContent(renderedFrame => renderedFrame.includes('Ship Plan'))

	expect(frame).toContain('Ship Plan')
	expect(frame).toContain('Verify the fix')
	expect(frame).toContain('bun run harness')
	expect(frame).not.toContain('## Ship Plan')
	expect(frame).not.toContain('`bun run harness`')
})

test('keeps footer status and shortcuts readable on narrower terminals', async () => {
	await renderApp({ messages: [{ content: 'Hello there', role: 'user' }], providerConfigured: true, width: 72 })

	const frame = getTestSetup().captureCharFrame()
	const tail = tailLines(frame, 12)

	expect(tail).toContain('Ask anything...')
	expect(tail).toContain('ctrl+r sessions')
})

test('opens and closes the sessions view with Ctrl+R', async () => {
	await renderApp({ messages: [{ content: 'Hello there', role: 'user' }], providerConfigured: true })

	expect(getTestSetup().captureCharFrame()).not.toContain('Search sessions')

	await triggerUiUpdate(() => {
		getTestSetup().mockInput.pressKey('r', { ctrl: true })
	})

	const sessionsFrame = await waitForFrameContent(renderedFrame => renderedFrame.includes('Search sessions'))

	expect(sessionsFrame).toContain('main / sessions')
	expect(sessionsFrame).toContain('Search sessions')

	await triggerUiUpdate(() => {
		getTestSetup().mockInput.pressKey('r', { ctrl: true })
	})

	const closedFrame = await waitForFrameContent(renderedFrame => !renderedFrame.includes('Search sessions'))

	expect(closedFrame).not.toContain('Search sessions')
})

test('opens the provider config view with Ctrl+P', async () => {
	await renderApp({ messages: [{ content: 'Hello there', role: 'user' }], providerConfigured: true })

	expect(getTestSetup().captureCharFrame()).not.toContain('Search providers')

	await triggerUiUpdate(() => {
		getTestSetup().mockInput.pressKey('p', { ctrl: true })
	})

	expect(getTestSetup().captureCharFrame()).toContain('settings')
	expect(getTestSetup().captureCharFrame()).toContain('esc back')
	expect(getTestSetup().captureCharFrame()).toContain('Search providers')
	expect(getTestSetup().captureCharFrame()).toContain('fireworks.ai')
})

test('moves between provider setup steps with arrow keys', async () => {
	await renderApp({ messages: [{ content: 'Hello there', role: 'user' }], providerConfigured: true })

	await triggerUiUpdate(() => {
		getTestSetup().mockInput.pressKey('p', { ctrl: true })
	})

	expect(getTestSetup().captureCharFrame()).toContain('Provider')
	expect(getTestSetup().captureCharFrame()).not.toContain('Maximum Tokens')

	await triggerUiUpdate(() => {
		getTestSetup().mockInput.pressArrow('right')
	})
	await settleUi()

	await triggerUiUpdate(() => {
		getTestSetup().mockInput.pressArrow('right')
	})

	expect(getTestSetup().captureCharFrame()).toContain('Maximum Tokens')
	expect(getTestSetup().captureCharFrame()).toContain('Prompt Truncation')
	expect(getTestSetup().captureCharFrame()).toContain('Temperature')
})

test('opens the shortcuts view with Ctrl+G', async () => {
	await renderApp({ messages: [{ content: 'Hello there', role: 'user' }], providerConfigured: true })

	expect(getTestSetup().captureCharFrame()).not.toContain('Keyboard-first controls')

	await triggerUiUpdate(() => {
		getTestSetup().mockInput.pressKey('g', { ctrl: true })
	})

	expect(getTestSetup().captureCharFrame()).toContain('main / shortcuts')
	expect(getTestSetup().captureCharFrame()).toContain('Keyboard-first controls for the current shell.')
	expect(getTestSetup().captureCharFrame()).toContain('ctrl+r')
})

test('opens the command palette with Ctrl+K and filters commands', async () => {
	await renderApp({ messages: [{ content: 'Hello there', role: 'user' }], providerConfigured: true })
	expect(getTestSetup().captureCharFrame()).not.toContain('Commands')
	const commandPaletteFrame = await openCommandPalette()
	expect(commandPaletteFrame).toContain('main / commands')

	await triggerUiUpdate(async () => {
		await getTestSetup().mockInput.typeText('provider')
	})

	expect(getTestSetup().captureCharFrame()).toContain('Provider settings')
})

test('opens the tools view from the command palette and shows tool details', async () => {
	await renderApp({ messages: [{ content: 'Hello there', role: 'user' }], providerConfigured: true })
	await openCommandPalette()
	await triggerUiUpdate(async () => {
		await getTestSetup().mockInput.typeText('tools')
	})

	await triggerUiUpdate(() => {
		getTestSetup().mockInput.pressEnter()
	})

	const toolsFrame = await waitForFrameContent(renderedFrame => renderedFrame.includes('Search tools'))
	expect(toolsFrame).toContain('main / tools')
	expect(toolsFrame).toContain('read')

	await triggerUiUpdate(async () => {
		await getTestSetup().mockInput.typeText('read')
	})

	await triggerUiUpdate(() => {
		getTestSetup().mockInput.pressEnter()
	})

	const detailFrame = await waitForFrameContent(
		renderedFrame =>
			renderedFrame.includes('main / tools / read') &&
			renderedFrame.includes('Parameters') &&
			renderedFrame.includes('Workspace-relative file path to read.')
	)
	expect(detailFrame).toContain('workspace file access')
	expect(detailFrame).toContain('Parameters')
	expect(detailFrame).toContain('Workspace-relative file path to read.')
})
