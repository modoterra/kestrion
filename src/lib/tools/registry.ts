import { APP_TOOL_REGISTRY } from './app-tool-registry'
import type { RegisteredTool } from './tool-types'
import { WORKSPACE_TOOL_REGISTRY } from './workspace-tool-registry'

export const TOOL_REGISTRY: RegisteredTool[] = [...WORKSPACE_TOOL_REGISTRY, ...APP_TOOL_REGISTRY]

export function getRegisteredTool(name: string, registry = TOOL_REGISTRY): RegisteredTool | undefined {
	return registry.find(tool => tool.name === name)
}
