import { expect, test } from 'bun:test'

import type { McpConfig } from '../config'
import { callMcpTool, listMcpTools } from './client'

test('listMcpTools initializes once, carries bearer auth, and reuses the MCP session id', async () => {
	const headersByMethod: Record<string, string[]> = {}
	const listing = await listMcpTools(createMcpConfig(), createListFetch(headersByMethod))

	expect(listing.server.serverTitle).toBe('Demo Server')
	expect(listing.server.instructions).toBe('Use the remote tools carefully.')
	expect(listing.tools.map(tool => tool.name)).toEqual(['alpha', 'beta'])
	expect(listing.tools[0]?.parameters).toEqual([
		{ description: 'Search query', name: 'query', required: true, type: 'string' }
	])
	expect(headersByMethod.initialize).toEqual(['Bearer demo-pat', '2025-11-25', ''])
	expect(headersByMethod['notifications/initialized']).toEqual(['Bearer demo-pat', '2025-11-25', 'session-123'])
	expect(headersByMethod['tools/list']).toEqual(['Bearer demo-pat', '2025-11-25', 'session-123'])
})

test('callMcpTool submits parsed JSON arguments and returns the raw result payload', async () => {
	let capturedArguments: Record<string, unknown> | undefined
	const result = await callMcpTool(createMcpConfig(), 'alpha', '{"query":"launch"}', createCallFetch(args => {
		capturedArguments = args
	}))

	expect(capturedArguments).toEqual({ query: 'launch' })
	expect(result.isError).toBeFalse()
	expect(result.resultJson).toContain('"structuredContent"')
})

function createMcpConfig(): McpConfig {
	return {
		enabled: true,
		endpoint: 'https://example.com/mcp',
		pat: 'demo-pat',
		patEnv: 'KESTRION_MCP_PAT',
		patSource: 'config'
	}
}

function createListFetch(headersByMethod: Record<string, string[]>): typeof fetch {
	return ((_input: URL | RequestInfo, init?: RequestInit | BunFetchRequestInit) => {
		const body = parseBody(init)
		headersByMethod[body.method] = getTrackedHeaders(init)

		if (body.method === 'initialize') {
			return createInitializeResponse('Demo Server', '1.2.3', 'session-123', 'Use the remote tools carefully.')
		}

		if (body.method === 'notifications/initialized') {
			return new Response('', { status: 202 })
		}

		if (body.method === 'tools/list' && !body.params?.cursor) {
			return createFirstListPageResponse()
		}

		if (body.method === 'tools/list' && body.params?.cursor === 'page-2') {
			return createSecondListPageResponse()
		}

		throw new Error(`Unexpected MCP method: ${body.method}`)
	}) as unknown as typeof fetch
}

function createCallFetch(onCall: (args: Record<string, unknown> | undefined) => void): typeof fetch {
	return ((_input: URL | RequestInfo, init?: RequestInit | BunFetchRequestInit) => {
		const body = parseBody(init)

		if (body.method === 'initialize') {
			return createInitializeResponse(undefined, '1.0.0')
		}

		if (body.method === 'notifications/initialized') {
			return new Response('', { status: 202 })
		}

		if (body.method === 'tools/call') {
			onCall(body.params?.arguments as Record<string, unknown> | undefined)
			return createToolCallResponse()
		}

		throw new Error(`Unexpected MCP method: ${body.method}`)
	}) as unknown as typeof fetch
}

function parseBody(init?: RequestInit | BunFetchRequestInit): { method: string; params?: Record<string, unknown> } {
	return JSON.parse(String(init?.body)) as { method: string; params?: Record<string, unknown> }
}

function getTrackedHeaders(init?: RequestInit | BunFetchRequestInit): string[] {
	const headers = new Headers(init?.headers)
	return [
		headers.get('Authorization') ?? '',
		headers.get('MCP-Protocol-Version') ?? '',
		headers.get('MCP-Session-Id') ?? ''
	]
}

function createInitializeResponse(
	title?: string,
	version = '1.0.0',
	sessionId?: string,
	instructions?: string
): Response {
	return new Response(
		JSON.stringify({
			id: 1,
			jsonrpc: '2.0',
			result: {
				instructions,
				protocolVersion: '2025-11-25',
				serverInfo: { name: 'demo-server', title, version }
			}
		}),
		{
			headers: {
				'Content-Type': 'application/json',
				...(sessionId ? { 'MCP-Session-Id': sessionId } : {})
			},
			status: 200
		}
	)
}

function createFirstListPageResponse(): Response {
	return new Response(
		JSON.stringify({
			id: 2,
			jsonrpc: '2.0',
			result: {
				nextCursor: 'page-2',
				tools: [
					{
						annotations: { readOnlyHint: true, title: 'Alpha Tool' },
						description: 'First page tool',
						inputSchema: {
							properties: {
								query: { description: 'Search query', type: 'string' }
							},
							required: ['query'],
							type: 'object'
						},
						name: 'alpha'
					}
				]
			}
		}),
		{ headers: { 'Content-Type': 'application/json' }, status: 200 }
	)
}

function createSecondListPageResponse(): Response {
	return new Response(
		[
			'event: message',
			'data: {"id":3,"jsonrpc":"2.0","result":{"tools":[{"description":"Second page tool","inputSchema":{"type":"object"},"name":"beta","title":"Beta Tool"}]}}',
			''
		].join('\n'),
		{ headers: { 'Content-Type': 'text/event-stream' }, status: 200 }
	)
}

function createToolCallResponse(): Response {
	return new Response(
		JSON.stringify({
			id: 2,
			jsonrpc: '2.0',
			result: {
				content: [{ text: 'ok', type: 'text' }],
				isError: false,
				structuredContent: { ok: true }
			}
		}),
		{ headers: { 'Content-Type': 'application/json' }, status: 200 }
	)
}
