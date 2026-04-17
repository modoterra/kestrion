import type { McpConfig } from '../config'
import type { McpServerSnapshot, McpToolCallResult, McpToolListing, McpToolParameter, McpToolRecord } from './types'

const JSON_RPC_VERSION = '2.0'
const MCP_PROTOCOL_VERSION = '2025-11-25'

type JsonRpcError = { code: number; data?: unknown; message: string }
type JsonRpcMessage = JsonRpcNotification | JsonRpcRequest | JsonRpcResponse
type JsonRpcNotification = { jsonrpc: '2.0'; method: string; params?: Record<string, unknown> }
type JsonRpcRequest = { id: number; jsonrpc: '2.0'; method: string; params?: Record<string, unknown> }
type JsonRpcResponse = { error?: JsonRpcError; id?: number | string | null; jsonrpc: '2.0'; result?: Record<string, unknown> }
type InitializeResult = {
	instructions?: string
	protocolVersion?: string
	serverInfo?: { name?: string; title?: string; version?: string }
}
type ListToolsResponse = { nextCursor?: string; tools?: unknown[] }
type CallToolResponse = { isError?: boolean }

type McpFetch = typeof fetch

export function assertMcpConfigured(config: McpConfig): void {
	if (!config.enabled) {
		throw new Error('MCP is disabled. Open MCP settings to enable it.')
	}

	if (!config.endpoint.trim()) {
		throw new Error('MCP endpoint is missing.')
	}

	if (!config.pat.trim()) {
		throw new Error(`Missing MCP PAT. Set ${config.patEnv} or update the MCP settings.`)
	}

	try {
		const endpoint = new URL(config.endpoint)
		if (endpoint.protocol !== 'http:' && endpoint.protocol !== 'https:') {
			throw new Error('MCP endpoint must use http:// or https://.')
		}
	} catch (error) {
		throw new Error(error instanceof Error ? error.message : 'MCP endpoint must be a valid absolute URL.')
	}
}

export async function listMcpTools(config: McpConfig, fetchImpl: McpFetch = fetch): Promise<McpToolListing> {
	assertMcpConfigured(config)
	const client = new McpHttpClient(config, fetchImpl)
	const server = await client.initialize()
	const tools = await client.listTools()
	return { server, tools }
}

export async function callMcpTool(
	config: McpConfig,
	toolName: string,
	argumentsJson: string,
	fetchImpl: McpFetch = fetch
): Promise<McpToolCallResult> {
	assertMcpConfigured(config)
	let parsedArguments: Record<string, unknown> | undefined
	const trimmedArguments = argumentsJson.trim()

	if (trimmedArguments) {
		try {
			const parsed = JSON.parse(trimmedArguments) as unknown
			if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
				throw new Error('Tool arguments must be a JSON object.')
			}
			parsedArguments = parsed as Record<string, unknown>
		} catch (error) {
			throw new Error(error instanceof Error ? error.message : 'Tool arguments must be valid JSON.')
		}
	}

	const client = new McpHttpClient(config, fetchImpl)
	await client.initialize()
	return client.callTool(toolName, parsedArguments)
}

class McpHttpClient {
	private initialized = false
	private nextRequestId = 1
	private negotiatedProtocolVersion = MCP_PROTOCOL_VERSION
	private serverSnapshot: McpServerSnapshot | null = null
	private sessionId: string | null = null

	constructor(
		private readonly config: McpConfig,
		private readonly fetchImpl: McpFetch
	) {}

	async initialize(): Promise<McpServerSnapshot> {
		if (this.serverSnapshot) {
			return this.serverSnapshot
		}

		const response = await this.sendRequest<InitializeResult>('initialize', {
			capabilities: {},
			clientInfo: { name: 'kestrion', version: '1.0.0' },
			protocolVersion: MCP_PROTOCOL_VERSION
		})

		this.negotiatedProtocolVersion =
			typeof response.protocolVersion === 'string' && response.protocolVersion.trim()
				? response.protocolVersion
				: MCP_PROTOCOL_VERSION
		this.serverSnapshot = {
			endpoint: this.config.endpoint,
			instructions: typeof response.instructions === 'string' && response.instructions.trim() ? response.instructions : null,
			protocolVersion: this.negotiatedProtocolVersion,
			serverName: response.serverInfo?.name?.trim() || 'unknown',
			serverTitle: response.serverInfo?.title?.trim() || response.serverInfo?.name?.trim() || 'Unknown server',
			serverVersion: response.serverInfo?.version?.trim() || 'unknown'
		}

		await this.sendNotification('notifications/initialized')
		this.initialized = true
		return this.serverSnapshot
	}

	async listTools(): Promise<McpToolRecord[]> {
		if (!this.initialized) {
			await this.initialize()
		}

		const tools: McpToolRecord[] = []
		let cursor: string | undefined

		for (;;) {
			const response = await this.sendRequest<ListToolsResponse>(
				'tools/list',
				cursor ? { cursor } : undefined
			)
			for (const tool of response.tools ?? []) {
				const normalized = normalizeMcpTool(tool)
				if (normalized) {
					tools.push(normalized)
				}
			}

			if (!response.nextCursor) {
				return tools.toSorted((left, right) => left.title.localeCompare(right.title) || left.name.localeCompare(right.name))
			}

			cursor = response.nextCursor
		}
	}

	async callTool(name: string, args?: Record<string, unknown>): Promise<McpToolCallResult> {
		if (!this.initialized) {
			await this.initialize()
		}

		const response = await this.sendRequest<CallToolResponse>('tools/call', {
			...(args ? { arguments: args } : {}),
			name
		})

		return {
			isError: response.isError === true,
			resultJson: JSON.stringify(response, null, 2)
		}
	}

	private async sendNotification(method: string, params?: Record<string, unknown>): Promise<void> {
		await this.sendMessage({ jsonrpc: JSON_RPC_VERSION, method, ...(params ? { params } : {}) }, false)
	}

	private async sendRequest<TResult>(method: string, params?: Record<string, unknown>): Promise<TResult> {
		const requestId = this.nextRequestId++
		const response = await this.sendMessage({ id: requestId, jsonrpc: JSON_RPC_VERSION, method, ...(params ? { params } : {}) }, true)
		if (response.id !== requestId) {
			throw new Error(`MCP server returned an unexpected response id for "${method}".`)
		}

		if (response.error) {
			throw new Error(response.error.message || `MCP request "${method}" failed.`)
		}

		return (response.result ?? {}) as TResult
	}

	private async sendMessage(message: JsonRpcNotification | JsonRpcRequest, expectResponse: boolean): Promise<JsonRpcResponse> {
		const response = await this.fetchImpl(this.config.endpoint, {
			body: JSON.stringify(message),
			headers: buildRequestHeaders(this.config.pat, this.negotiatedProtocolVersion, this.sessionId),
			method: 'POST'
		})
		this.captureTransportState(response)

		if (response.status === 401) {
			throw new Error('MCP server rejected the PAT with HTTP 401.')
		}
		if (response.status === 403) {
			throw new Error('MCP server rejected the PAT with HTTP 403.')
		}
		if (response.status === 404 && this.sessionId) {
			this.sessionId = null
			this.initialized = false
			this.serverSnapshot = null
			throw new Error('MCP session expired. Retry the request.')
		}
		if (!response.ok) {
			throw new Error(`MCP request failed with HTTP ${response.status}.`)
		}

		if (!expectResponse) {
			return { jsonrpc: JSON_RPC_VERSION }
		}

		const messages = await readResponseMessages(response)
		const result = messages.find(candidate => 'id' in candidate && (candidate as JsonRpcResponse).id !== undefined)
		if (!result || !('jsonrpc' in result)) {
			throw new Error('MCP server returned no JSON-RPC response.')
		}

		return result as JsonRpcResponse
	}

	private captureTransportState(response: Response): void {
		const nextSessionId = response.headers.get('MCP-Session-Id') ?? response.headers.get('Mcp-Session-Id')
		if (nextSessionId?.trim()) {
			this.sessionId = nextSessionId.trim()
		}
	}
}

function buildRequestHeaders(pat: string, protocolVersion: string, sessionId: string | null): Headers {
	const headers = new Headers({
		Accept: 'application/json, text/event-stream',
		Authorization: `Bearer ${pat}`,
		'Content-Type': 'application/json'
	})

	if (protocolVersion.trim()) {
		headers.set('MCP-Protocol-Version', protocolVersion)
	}
	if (sessionId) {
		headers.set('MCP-Session-Id', sessionId)
	}

	return headers
}

async function readResponseMessages(response: Response): Promise<JsonRpcMessage[]> {
	const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
	const body = await response.text()
	if (!body.trim()) {
		return []
	}

	if (contentType.includes('text/event-stream')) {
		return parseSseMessages(body)
	}

	return [parseJsonRpcMessage(body)]
}

function parseSseMessages(body: string): JsonRpcMessage[] {
	const messages: JsonRpcMessage[] = []
	const events = body.split(/\r?\n\r?\n/)

	for (const event of events) {
		const dataLines = event
			.split(/\r?\n/)
			.filter(line => line.startsWith('data:'))
			.map(line => line.slice('data:'.length).trim())
		if (dataLines.length <= 0) {
			continue
		}

		messages.push(parseJsonRpcMessage(dataLines.join('\n')))
	}

	return messages
}

function parseJsonRpcMessage(body: string): JsonRpcMessage {
	const parsed = JSON.parse(body) as unknown
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		throw new Error('MCP server returned a non-object JSON-RPC payload.')
	}

	return parsed as JsonRpcMessage
}

function normalizeMcpTool(value: unknown): McpToolRecord | null {
	if (!isRecord(value) || typeof value.name !== 'string' || !value.name.trim()) {
		return null
	}

	const inputSchema = isRecord(value.inputSchema) ? value.inputSchema : {}
	const annotations = isRecord(value.annotations) ? value.annotations : {}
	const title =
		typeof value.title === 'string' && value.title.trim()
			? value.title.trim()
			: typeof annotations.title === 'string' && annotations.title.trim()
				? annotations.title.trim()
				: value.name.trim()

	return {
		description: typeof value.description === 'string' && value.description.trim() ? value.description.trim() : 'No description provided.',
		destructiveHint: annotations.destructiveHint === true,
		idempotentHint: annotations.idempotentHint === true,
		inputSchema,
		name: value.name.trim(),
		openWorldHint: annotations.openWorldHint !== false,
		parameters: buildMcpToolParameters(inputSchema),
		readOnlyHint: annotations.readOnlyHint === true,
		title
	}
}

function buildMcpToolParameters(inputSchema: Record<string, unknown>): McpToolParameter[] {
	const properties = isRecord(inputSchema.properties) ? inputSchema.properties : {}
	const required = new Set(Array.isArray(inputSchema.required) ? inputSchema.required.filter(isNonEmptyString) : [])

	return Object.entries(properties)
		.map(([name, property]): McpToolParameter => {
			const definition = isRecord(property) ? property : {}
			return {
				description:
					typeof definition.description === 'string' && definition.description.trim()
						? definition.description.trim()
						: 'No description provided.',
				name,
				required: required.has(name),
				type: formatSchemaType(definition.type)
			}
		})
		.toSorted((left, right) => {
			if (left.required !== right.required) {
				return left.required ? -1 : 1
			}

			return left.name.localeCompare(right.name)
		})
}

function formatSchemaType(value: unknown): string {
	if (typeof value === 'string' && value.trim()) {
		return value
	}
	if (Array.isArray(value)) {
		const types = value.filter(isNonEmptyString)
		if (types.length > 0) {
			return types.join(' | ')
		}
	}

	return 'unknown'
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}
