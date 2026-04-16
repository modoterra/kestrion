import { afterEach, expect, test } from 'bun:test'

import { cleanupRenderedApp, renderApp, waitForFrameContent } from '../../../test/app-test-utils'

afterEach(async () => {
	await cleanupRenderedApp()
})

test('renders persisted tool-call rows from a seeded saved conversation', async () => {
	await renderApp({
		providerConfigured: true,
		savedConversations: [
			{
				messages: [
					{ content: 'Please inspect the controller flow.', role: 'user' },
					{ content: 'I checked the controller and saved the relevant notes.', role: 'assistant' }
				],
				toolCallBatches: [
					[
						{ argumentsJson: '{"path":"/agent/src/lib/runtime/daemon/controller.ts"}', id: 'seed-read', name: 'read' },
						{ argumentsJson: '{"pattern":"toolCallsStart"}', id: 'seed-grep', name: 'grep' }
					]
				]
			}
		]
	})

	const frame = await waitForFrameContent(renderedFrame => renderedFrame.includes('used tools'))
	expect(frame).toContain('used tools')
	expect(frame).toContain('read')
	expect(frame).toContain('grep')
})
