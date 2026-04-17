export type McpToolParameter = {
	description: string
	name: string
	required: boolean
	type: string
}

export type McpToolRecord = {
	description: string
	destructiveHint: boolean
	idempotentHint: boolean
	inputSchema: Record<string, unknown>
	name: string
	openWorldHint: boolean
	parameters: McpToolParameter[]
	readOnlyHint: boolean
	title: string
}

export type McpServerSnapshot = {
	endpoint: string
	instructions: string | null
	protocolVersion: string
	serverName: string
	serverTitle: string
	serverVersion: string
}

export type McpToolListing = {
	server: McpServerSnapshot
	tools: McpToolRecord[]
}

export type McpToolCallResult = {
	isError: boolean
	resultJson: string
}
