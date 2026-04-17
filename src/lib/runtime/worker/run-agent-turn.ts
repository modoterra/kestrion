import { assertMatrixPromptConfigured, resolveRuntimeAppConfig } from '../../config'
import { buildInferenceRequest } from '../../inference/execution-profile'
import { createInferenceAdapter } from '../../inference/registry'
import { createErroredToolAuditRecord, createToolInvocationAuditRecord } from '../../tools/audit'
import type { ToolInvocationAuditRecord, ToolMutationRecord } from '../../tools/tool-types'
import type { ToolExecutionContext } from '../../tools/tool-types'
import { createWorkerToolRegistry } from '../../tools/worker-tool-registry'
import { WORKSPACE_TOOL_REGISTRY } from '../../tools/workspace-tool-registry'
import type {
	WorkerSessionBootstrap,
	WorkerToolExecutionRequest,
	WorkerToolExecutionResponse,
	WorkerTurnCompletedEvent,
	WorkerTurnEvent,
	WorkerTurnInput
} from './types'

export async function executeWorkerToolRequest(
	bootstrap: WorkerSessionBootstrap,
	request: WorkerToolExecutionRequest
): Promise<WorkerToolExecutionResponse> {
	const tool = WORKSPACE_TOOL_REGISTRY.find(candidate => candidate.name === request.toolName)
	if (!tool) {
		return {
			audits: [],
			error: `Unknown worker tool "${request.toolName}".`,
			mutations: [],
			ok: false,
			requestId: request.requestId
		}
	}

	const audits: ToolInvocationAuditRecord[] = []
	const mutations: ToolMutationRecord[] = []
	const startedAt = Date.now()
	try {
		const result = await tool.execute(request.argumentsJson, {
			allowedMemoryKinds: request.authorization.allowedMemoryKinds,
			allowedSkillNames: request.authorization.allowedSkillNames,
			fileAccessPolicy: request.authorization.fileAccessPolicy ?? bootstrap.filesystem,
			networkAccessPolicy: request.authorization.networkAccessPolicy,
			onAuditRecord: audit => {
				audits.push(audit)
			},
			onMutation: mutation => {
				mutations.push(mutation)
			},
			todoAllowed: request.authorization.todoAllowed,
			toolRegistry: WORKSPACE_TOOL_REGISTRY,
			workspaceRoot: bootstrap.filesystem.defaultReadRoot
		})

		return {
			audits: [
				...audits,
				createToolInvocationAuditRecord(request.toolName, request.argumentsJson, result, Date.now() - startedAt)
			],
			mutations,
			ok: true,
			requestId: request.requestId,
			result,
			telemetry: { durationMs: Date.now() - startedAt }
		}
	} catch (error) {
		return {
			audits: [
				...audits,
				createErroredToolAuditRecord(
					request.toolName,
					request.argumentsJson,
					error instanceof Error ? error.message : 'Unknown worker execution error.',
					Date.now() - startedAt
				)
			],
			error: error instanceof Error ? error.message : 'Unknown worker execution error.',
			mutations,
			ok: false,
			requestId: request.requestId,
			telemetry: { durationMs: Date.now() - startedAt }
		}
	}
}

export async function runAgentTurn(
	input: WorkerTurnInput,
	onEvent: (event: WorkerTurnEvent) => void,
	signal?: AbortSignal
): Promise<WorkerTurnCompletedEvent> {
	const config = resolveRuntimeAppConfig(input.config)
	assertMatrixPromptConfigured(config)
	const adapter = createInferenceAdapter(input.conversation.provider, config, {
		fileAccessPolicy: input.filesystem,
		onAuditRecord: audit => {
			onEvent({ audit, type: 'toolAudit' })
		},
		onMutation: mutation => {
			onEvent({ mutation, type: 'mutation' })
		},
		toolRegistry: createWorkerToolRegistry(async () => JSON.stringify({ error: 'Hosted tools disabled.', ok: false })),
		workspaceRoot: input.filesystem.defaultReadRoot
	})
	const preparedRequest = buildInferenceRequest({
		config,
		conversation: input.conversation,
		events: {
			onTextDelta: delta => {
				onEvent({ delta, type: 'textDelta' })
			},
			onToolCallsFinish: toolCalls => {
				onEvent({ toolCalls, type: 'toolCallsFinish' })
			},
			onToolCallsStart: toolCalls => {
				onEvent({ toolCalls, type: 'toolCallsStart' })
			}
		},
		messages: input.messages,
		signal
	})
	const result = await adapter.complete(preparedRequest.request)
	const completionEvent = {
		content: result.content,
		model: result.model,
		provider: result.provider,
		type: 'completed'
	} as const
	onEvent(completionEvent)
	return completionEvent
}
