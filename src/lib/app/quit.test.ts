import { expect, test } from 'bun:test'

import { quitApplication } from './quit'

test('destroys the renderer before exiting the process', () => {
	const calls: string[] = []

	quitApplication(
		{
			destroy: () => {
				calls.push('destroy')
			}
		},
		code => {
			calls.push(`exit:${String(code)}`)
		}
	)

	expect(calls).toEqual(['destroy', 'exit:0'])
})
