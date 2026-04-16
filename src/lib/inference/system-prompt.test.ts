import { expect, test } from 'bun:test'

import { buildRuntimeSystemPrompt } from './system-prompt'

test('buildRuntimeSystemPrompt appends a clear current date, time, and timezone block', () => {
	const prompt = buildRuntimeSystemPrompt('You are Kestrion.', new Date('2026-04-15T16:32:10Z'), 'UTC')

	expect(prompt).toContain('You are Kestrion.')
	expect(prompt).toContain('CURRENT DATE, TIME, AND TIME ZONE:')
	expect(prompt).toContain('Current date: 2026-04-15')
	expect(prompt).toContain('Current time: 16:32:10')
	expect(prompt).toContain('Current time zone: UTC')
	expect(prompt).toContain('authoritative current temporal context')
})
