import type { AppPaths } from '../../paths'
import { createErroredToolAuditRecord, createToolInvocationAuditRecord } from '../../tools/audit'
import { getRegisteredTool } from '../../tools/registry'
import type { ToolExecutionContext } from '../../tools/tool-types'

type HostedToolRequest = { argumentsJson: string; requestId: string; toolName: string; type?: string }
type HostedToolResponse =
	| { requestId: string; result: string; type: 'hostToolResponse' }
	| { error: string; requestId: string; type: 'hostToolError' }

const HOSTED_WORKER_TOOL_NAMES = new Set(['fetch', 'remember', 'skill', 'todo'])

export async function executeDaemonHostedToolRequest(
	paths: AppPaths,
	request: HostedToolRequest,
	context: ToolExecutionContext = {}
): Promise<HostedToolResponse> {
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
		const startedAt = Date.now()
		const result = await tool.execute(request.argumentsJson, { ...context, appPaths: paths })
		context.onAuditRecord?.(
			createToolInvocationAuditRecord(request.toolName, request.argumentsJson, result, Date.now() - startedAt)
		)
		return { requestId: request.requestId, result, type: 'hostToolResponse' }
	} catch (error) {
		context.onAuditRecord?.(
			createErroredToolAuditRecord(
				request.toolName,
				request.argumentsJson,
				error instanceof Error ? error.message : 'Unknown host tool error.',
				0
			)
		)
		return {
			error: error instanceof Error ? error.message : 'Unknown host tool error.',
			requestId: request.requestId,
			type: 'hostToolError'
		}
	}
}
