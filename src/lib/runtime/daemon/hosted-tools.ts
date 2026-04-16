import type { AppPaths } from '../../paths'
import { getRegisteredTool } from '../../tools/registry'
import type { ToolExecutionContext } from '../../tools/tool-types'
import type { WorkerHostToolRequest, WorkerHostToolResponse } from '../worker/types'

const HOSTED_WORKER_TOOL_NAMES = new Set(['remember', 'skill', 'todo'])

export async function executeDaemonHostedToolRequest(
	paths: AppPaths,
	request: WorkerHostToolRequest,
	context: ToolExecutionContext = {}
): Promise<WorkerHostToolResponse> {
	if (!HOSTED_WORKER_TOOL_NAMES.has(request.toolName)) {
		return {
			error: `Tool "${request.toolName}" is not available through the daemon host bridge.`,
			requestId: request.requestId,
			type: 'hostToolError'
		}
	}

	const tool = getRegisteredTool(request.toolName)
	if (!tool) {
		return {
			error: `Host-managed tool "${request.toolName}" is not registered.`,
			requestId: request.requestId,
			type: 'hostToolError'
		}
	}

	try {
		return {
			requestId: request.requestId,
			result: await tool.execute(request.argumentsJson, { ...context, appPaths: paths }),
			type: 'hostToolResponse'
		}
	} catch (error) {
		return {
			error: error instanceof Error ? error.message : 'Unknown host tool error.',
			requestId: request.requestId,
			type: 'hostToolError'
		}
	}
}
