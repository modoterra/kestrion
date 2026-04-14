export { getToolCatalogEntry, TOOL_CATALOG, type ToolCatalogEntry, type ToolCatalogParameter } from './catalog'
import { getRegisteredTool, TOOL_REGISTRY } from './registry'
import type { ToolExecutionContext } from './tool-types'

export const TOOL_DEFINITIONS = TOOL_REGISTRY.map(tool => tool.definition)

export function executeToolCall(name: string, argumentsJson: string, context: ToolExecutionContext): Promise<string> {
	const tool = getRegisteredTool(name)
	return tool
		? Promise.resolve(tool.execute(argumentsJson, context))
		: Promise.resolve(JSON.stringify({ error: `Unknown tool "${name}".`, ok: false }))
}
