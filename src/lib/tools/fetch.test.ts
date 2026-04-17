import { expect, test } from 'bun:test'

import { executeFetchTool } from './fetch'

test('fetches web content through the gateway and returns truncated text', async () => {
	const result = JSON.parse(
		await executeFetchTool(JSON.stringify({ maxCharacters: 5, url: 'https://example.com/docs' }), {
			fetchGatewayRequester: () =>
				Promise.resolve({
					body: 'abcdefghij',
					headers: { 'content-type': 'text/plain; charset=utf-8' },
					status: 200,
					url: 'https://example.com/docs'
				}),
			fetchGatewayResolver: () => Promise.resolve([{ address: '93.184.216.34', family: 4 }])
		})
	) as {
		content: string
		contentType: string
		ok: boolean
		sizeBytes: number
		status: number
		truncated: boolean
		url: string
	}

	expect(result.ok).toBe(true)
	expect(result.status).toBe(200)
	expect(result.url).toBe('https://example.com/docs')
	expect(result.content).toBe('abcde')
	expect(result.truncated).toBe(true)
	expect(result.contentType).toContain('text/plain')
	expect(result.sizeBytes).toBe(10)
})

test('denies fetches to non-allowlisted domains when a network policy is present', async () => {
	const result = JSON.parse(
		await executeFetchTool(JSON.stringify({ url: 'https://example.com/docs' }), {
			networkAccessPolicy: { allowedDomains: ['fireworks.ai'] }
		})
	) as { error: string; ok: boolean }

	expect(result.ok).toBe(false)
	expect(result.error).toContain('denied by policy')
})

test('rejects blocked resolved addresses before requesting the destination', async () => {
	const result = JSON.parse(
		await executeFetchTool(JSON.stringify({ url: 'https://example.com/docs' }), {
			fetchGatewayRequester: () => {
				throw new Error('should not request blocked destinations')
			},
			fetchGatewayResolver: () => Promise.resolve([{ address: '127.0.0.1', family: 4 }])
		})
	) as { error: string; ok: boolean }

	expect(result.ok).toBe(false)
	expect(result.error).toContain('blocked')
})

test('revalidates redirect destinations through the gateway', async () => {
	let requestCount = 0

	const result = JSON.parse(
		await executeFetchTool(JSON.stringify({ url: 'https://example.com/docs' }), {
			fetchGatewayRequester: ({ url }) => {
				requestCount += 1
				if (requestCount === 1) {
					return Promise.resolve({
						body: '',
						headers: { location: 'https://internal.example.net/secret' },
						status: 302,
						url: url.toString()
					})
				}

				throw new Error('should not follow blocked redirects')
			},
			fetchGatewayResolver: hostname => {
				if (hostname === 'example.com') {
					return Promise.resolve([{ address: '93.184.216.34', family: 4 }])
				}

				return Promise.resolve([{ address: '169.254.169.254', family: 4 }])
			}
		})
	) as { error: string; ok: boolean }

	expect(result.ok).toBe(false)
	expect(result.error).toContain('blocked')
	expect(requestCount).toBe(1)
})

test('rejects oversized responses and disallowed mime types', async () => {
	const oversized = JSON.parse(
		await executeFetchTool(JSON.stringify({ url: 'https://example.com/large' }), {
			fetchGatewayRequester: () =>
				Promise.resolve({ body: 'x'.repeat(1_048_577), headers: { 'content-type': 'text/plain' }, status: 200 }),
			fetchGatewayResolver: () => Promise.resolve([{ address: '93.184.216.34', family: 4 }])
		})
	) as { error: string; ok: boolean }
	const disallowedMime = JSON.parse(
		await executeFetchTool(JSON.stringify({ url: 'https://example.com/image' }), {
			fetchGatewayRequester: () =>
				Promise.resolve({ body: 'pretend image', headers: { 'content-type': 'image/png' }, status: 200 }),
			fetchGatewayResolver: () => Promise.resolve([{ address: '93.184.216.34', family: 4 }])
		})
	) as { error: string; ok: boolean }

	expect(oversized.ok).toBe(false)
	expect(oversized.error).toContain('exceeded')
	expect(disallowedMime.ok).toBe(false)
	expect(disallowedMime.error).toContain('not allowed')
})
