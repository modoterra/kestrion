import { TOOL_REGISTRY } from './registry'

export type ToolCatalogParameter = { description: string; name: string; required: boolean; type: string }

export type ToolCatalogEntry = {
	category: string
	description: string
	execution: 'local' | 'network'
	name: string
	parameters: ToolCatalogParameter[]
	restrictions: string[]
	scope: string
}

export const TOOL_CATALOG = TOOL_REGISTRY.map(tool => ({
	category: tool.metadata.category,
	description: tool.definition.function.description,
	execution: tool.metadata.execution,
	name: tool.name,
	parameters: buildParameterCatalog(
		tool.definition.function.parameters.properties,
		tool.definition.function.parameters.required
	),
	restrictions: tool.metadata.restrictions,
	scope: tool.metadata.scope
}))

export function getToolCatalogEntry(toolName: string): ToolCatalogEntry | undefined {
	return TOOL_CATALOG.find(tool => tool.name === toolName)
}

function buildParameterCatalog(
	properties: Record<string, { description?: string; type?: string | string[] }>,
	requiredList: readonly string[] | undefined
): ToolCatalogParameter[] {
	const required = new Set(requiredList ?? [])

	return Object.entries(properties)
		.map(([name, parameter]) => ({
			description: parameter.description ?? 'No description provided.',
			name,
			required: required.has(name),
			type: formatParameterType(parameter.type)
		}))
		.toSorted((left, right) => {
			if (left.required !== right.required) {
				return left.required ? -1 : 1
			}

			return left.name.localeCompare(right.name)
		})
}

function formatParameterType(value: string | string[] | undefined): string {
	if (!value) {
		return 'unknown'
	}

	return Array.isArray(value) ? value.join(' | ') : value
}
