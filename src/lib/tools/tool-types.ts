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
	options?: ToolQuestionOption[]
	placeholder?: string
	prompt: string
	title?: string
}

export type ToolQuestionAnswer =
	| { answer: string; cancelled?: false; optionLabel?: string; optionValue?: string; source: 'freeform' | 'option' }
	| { answer: ''; cancelled: true; source: 'cancelled' }

export type ToolExecutionContext = {
	appPaths?: AppPaths
	askQuestion?: (prompt: ToolQuestionPrompt) => Promise<ToolQuestionAnswer>
	workspaceRoot?: string
}

export type ToolExecutor = (argumentsJson: string, context: ToolExecutionContext) => Promise<string> | string

export type RegisteredTool = { definition: ToolDefinition; execute: ToolExecutor; metadata: ToolMetadata; name: string }
