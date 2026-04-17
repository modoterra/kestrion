import type { WritableAppConfig } from '../config'

export type McpDraft = {
	enabled: boolean
	endpoint: string
	pat: string
	patEnv: string
}

export function buildWritableMcpConfig(currentConfig: WritableAppConfig, draft: McpDraft): WritableAppConfig {
	const endpoint = draft.endpoint.trim()
	const patEnv = draft.patEnv.trim() || 'KESTRION_MCP_PAT'

	if (draft.enabled && !endpoint) {
		throw new Error('MCP endpoint cannot be empty while MCP is enabled.')
	}

	if (draft.enabled) {
		try {
			const parsed = new URL(endpoint)
			if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
				throw new Error('MCP endpoint must use http:// or https://.')
			}
		} catch (error) {
			throw new Error(error instanceof Error ? error.message : 'MCP endpoint must be a valid absolute URL.', {
				cause: error
			})
		}
	}

	return {
		...currentConfig,
		mcp: {
			enabled: draft.enabled,
			endpoint,
			pat: draft.pat.trim(),
			patEnv
		}
	}
}

export function toMcpDraft(config: WritableAppConfig): McpDraft {
	return {
		enabled: config.mcp.enabled,
		endpoint: config.mcp.endpoint,
		pat: config.mcp.pat,
		patEnv: config.mcp.patEnv
	}
}
