import { afterEach, expect, test } from 'bun:test'

import { executeFetchTool } from './fetch'

const originalFetch = globalThis.fetch

afterEach(() => {
	globalThis.fetch = originalFetch
})

test('fetches web content and returns truncated text', async () => {
	globalThis.fetch = (() =>
		Promise.resolve(
			new Response('abcdefghij', { headers: { 'Content-Type': 'text/plain; charset=utf-8' }, status: 200 })
		)) as unknown as typeof fetch

	const result = JSON.parse(
		await executeFetchTool(JSON.stringify({ maxCharacters: 5, url: 'https://example.com/docs' }))
	) as { content: string; contentType: string; ok: boolean; status: number; truncated: boolean; url: string }

	expect(result.ok).toBe(true)
	expect(result.status).toBe(200)
	expect(result.url).toBe('https://example.com/docs')
	expect(result.content).toBe('abcde')
	expect(result.truncated).toBe(true)
	expect(result.contentType).toContain('text/plain')
})
