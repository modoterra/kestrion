import { assertMatrixPromptConfigured, resolveRuntimeAppConfig } from '../../config'
import { buildInferenceRequest } from '../../inference/execution-profile'
import { createInferenceAdapter } from '../../inference/registry'
import type { ToolAuthorizationContext } from '../../tools/policy'
import type { ToolExecutionContext } from '../../tools/tool-types'
import { createWorkerToolRegistry, type WorkerHostedToolExecutor } from '../../tools/worker-tool-registry'
import type { WorkerTurnEvent, WorkerTurnInput } from './types'

export async function runAgentTurn(
	input: WorkerTurnInput,
	onEvent: (event: WorkerTurnEvent) => void,
	signal?: AbortSignal,
	authorizeToolCall?: (toolName: string, argumentsJson: string) => Promise<ToolAuthorizationContext>,
	executeHostedTool?: WorkerHostedToolExecutor
): Promise<Extract<WorkerTurnEvent, { type: 'completed' }>> {
	const config = resolveRuntimeAppConfig(input.config)
	assertMatrixPromptConfigured(config)
	const adapter = createInferenceAdapter(
		input.conversation.provider,
		config,
		buildToolContext(input, onEvent, authorizeToolCall, executeHostedTool)
	)
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

function buildToolContext(
	input: WorkerTurnInput,
	onEvent: (event: WorkerTurnEvent) => void,
	authorizeToolCall?: (toolName: string, argumentsJson: string) => Promise<ToolAuthorizationContext>,
	executeHostedTool?: WorkerHostedToolExecutor
): ToolExecutionContext {
	return {
		fileAccessPolicy: {
			defaultReadRoot: input.filesystem.defaultReadRoot,
			readRoots: input.filesystem.readRoots,
			writeRoots: input.filesystem.writeRoots
		},
		onMutation: mutation => {
			onEvent({ mutation, type: 'mutation' })
		},
		toolRegistry: createWorkerToolRegistry(executeHostedTool, authorizeToolCall),
		workspaceRoot: input.filesystem.defaultReadRoot
	}
}
