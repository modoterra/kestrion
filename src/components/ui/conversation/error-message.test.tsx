import { afterEach, expect, test } from 'bun:test'

import { testRender } from '@opentui/react/test-utils'
import { act } from 'react'

import { ErrorMessage } from './error-message'

afterEach(() => {
	act(() => {
		renderedApp?.renderer.destroy()
	})
	renderedApp = null
})

let renderedApp: Awaited<ReturnType<typeof testRender>> | null = null

test('shows MATRIX setup guidance for MATRIX-related errors', async () => {
	renderedApp = await testRender(
		<ErrorMessage
			assistantWidth='100%'
			error='MATRIX.md is required before sending a reply.\n/home/test/.config/kestrion/MATRIX.md'
		/>,
		{ height: 16, kittyKeyboard: true, width: 80 }
	)

	await renderedApp.renderOnce()
	const frame = renderedApp.captureCharFrame()

	expect(frame).toContain('MATRIX.md is required before sending a reply.')
	expect(frame).toContain('Use ctrl+k and run Setup MATRIX.md to fix it.')
})
