import type { AppPaths } from '../paths'

export type ToolDefinition = {
	function: {
		description: string
		name: string
		parameters: {
			additionalProperties?: boolean
			properties: Record<string, { description?: string; type?: string | string[] } & Record<string, unknown>>
			required?: readonly string[]
			type?: string
		}
		strict?: boolean
	}
	type: 'function'
}

export type ToolMetadata = { category: string; execution: 'local' | 'network'; restrictions: string[]; scope: string }

export type ToolQuestionOption = { description?: string; label: string; value: string }

export type ToolQuestionPrompt = {
	allowFreeform?: boolean
	freeformOptionValue?: string
	options?: ToolQuestionOption[]
	placeholder?: string
	prompt: string
	title?: string
}

export type ToolQuestionAnswer =
	| { answer: string; cancelled?: false; optionLabel?: string; optionValue?: string; source: 'freeform' | 'option' }
	| { answer: ''; cancelled: true; source: 'cancelled' }

export type ToolFileAccessPolicy = { defaultReadRoot: string; readRoots: string[]; writeRoots: string[] }
export type ToolFetchGatewayRequest = { resolvedAddress: { address: string; family: 4 | 6 }; url: URL }
export type ToolFetchGatewayResponse = {
	body: string | Uint8Array
	headers: Record<string, string | undefined>
	status: number
	url?: string
}
export type ToolMemoryKind = 'episodic' | 'long-term' | 'scratch'
export type ToolNetworkAccessPolicy = { allowedDomains: string[] }

export type ToolInvocationAuditRecord = {
	contentType?: string
	durationMs: number
	error?: string
	exitCode?: number
	finalUrl?: string
	outputSizeBytes?: number
	resourceUsage?: { maxResidentSetSizeBytes?: number; systemCpuMs?: number; userCpuMs?: number }
	responseSizeBytes?: number
	responseStatus?: number
	sanitizedArguments: unknown
	status: 'denied' | 'error' | 'success'
	timedOut?: boolean
	toolName: string
}
export type ToolMutationRecord = { operation: 'write'; path: string; sizeBytes: number; toolName: string }
export type ToolMemoryOrigin = {
	conversationId?: string
	model?: string
	provider?: string
	toolName: string
	turnId?: string
}

export type ToolExecutionContext = {
	allowedMemoryKinds?: ToolMemoryKind[]
	allowedSkillNames?: string[]
	appPaths?: AppPaths
	askQuestion?: (prompt: ToolQuestionPrompt) => Promise<ToolQuestionAnswer>
	fetchGatewayRequester?: (request: ToolFetchGatewayRequest) => Promise<ToolFetchGatewayResponse>
	fetchGatewayResolver?: (hostname: string) => Promise<Array<{ address: string; family: 4 | 6 }>>
	fileAccessPolicy?: ToolFileAccessPolicy
	memoryOrigin?: ToolMemoryOrigin
	networkAccessPolicy?: ToolNetworkAccessPolicy
	onAuditRecord?: (record: ToolInvocationAuditRecord) => void
	onMutation?: (record: ToolMutationRecord) => void
	todoAllowed?: boolean
	toolRegistry?: RegisteredTool[]
	workspaceRoot?: string
}

export type ToolExecutor = (argumentsJson: string, context: ToolExecutionContext) => Promise<string> | string

export type RegisteredTool = { definition: ToolDefinition; execute: ToolExecutor; metadata: ToolMetadata; name: string }
