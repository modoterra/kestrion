import { expect, test } from 'bun:test'

import { shouldExitCliForKey } from './cli-exit'

test('Ctrl+C always requests CLI exit', () => {
	expect(shouldExitCliForKey({ ctrl: true, name: 'c', raw: '\u0003', sequence: '\u0003' }, true)).toBe(true)
	expect(shouldExitCliForKey({ ctrl: true, name: 'c', raw: '\u0003', sequence: '\u0003' }, false)).toBe(true)
})

test('Ctrl+D only requests CLI exit before the app is ready', () => {
	expect(shouldExitCliForKey({ ctrl: true, name: 'd', raw: '\u0004', sequence: '\u0004' }, false)).toBe(true)
	expect(shouldExitCliForKey({ ctrl: true, name: 'd', raw: '\u0004', sequence: '\u0004' }, true)).toBe(false)
})
