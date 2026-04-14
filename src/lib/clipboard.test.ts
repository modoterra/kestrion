import { expect, test } from 'bun:test'

import { copySelectedText, copyTextToClipboard } from './clipboard'

test('copies the current selection and clears it', async () => {
	let osc52Payload = ''
	let cleared = false
	const nativeCopies: string[] = []

	const copied = await copySelectedText(
		{
			clearSelection: () => {
				cleared = true
			},
			copyToClipboardOSC52: (text: string) => {
				osc52Payload = text
				return true
			},
			getSelection: (): { getSelectedText: () => string } => ({
				getSelectedText: (): string => 'copied from selection'
			})
		},
		text => {
			nativeCopies.push(text)
			return Promise.resolve()
		}
	)

	expect(copied).toBe(true)
	expect(osc52Payload).toBe('copied from selection')
	expect(nativeCopies).toEqual(['copied from selection'])
	expect(cleared).toBe(true)
})

test('does nothing when there is no selected text', async () => {
	let cleared = false

	const copied = await copySelectedText(
		{
			clearSelection: () => {
				cleared = true
			},
			copyToClipboardOSC52: () => true,
			getSelection: () => null
		},
		() => {
			throw new Error('native copy should not run')
		}
	)

	expect(copied).toBe(false)
	expect(cleared).toBe(false)
})

test('keeps OSC52 copy even when native clipboard support fails', async () => {
	let osc52Payload = ''

	const copied = await copyTextToClipboard(
		{
			copyToClipboardOSC52: (text: string) => {
				osc52Payload = text
				return true
			}
		},
		'fallback copy',
		() => {
			throw new Error('native clipboard unavailable')
		}
	)

	expect(copied).toBe(true)
	expect(osc52Payload).toBe('fallback copy')
})
