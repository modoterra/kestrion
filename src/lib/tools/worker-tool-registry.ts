import type { WorkerHostedToolName } from '../runtime/worker/types'
import type { ToolAuthorizationContext } from './policy'
import { QUESTION_TOOL_NAME } from './question'
import { TOOL_REGISTRY } from './registry'
import { REMEMBER_TOOL_NAME } from './remember'
import { SKILL_TOOL_NAME } from './skill'
import { TODO_TOOL_NAME } from './todo'
import type { RegisteredTool, ToolExecutor } from './tool-types'

const SANDBOX_SCOPE = 'sandbox'
const HOST_MANAGED_TOOL_NAMES = new Set<WorkerHostedToolName>([REMEMBER_TOOL_NAME, SKILL_TOOL_NAME, TODO_TOOL_NAME])
const DETERMINISTIC_DENIAL_MESSAGES = new Map<string, string>([
	[QUESTION_TOOL_NAME, 'Tool "question" is not yet available through the sandbox worker protocol.']
])
const WORKER_TOOL_RESTRICTIONS: Record<string, string[]> = {
	bash: [
		'Runs inside the sandboxed /agent root only.',
		'Captures stdout and stderr with a timeout.',
		'Has no direct access to app storage or host user directories.'
	],
	edit: [
		'Edits UTF-8 files under /agent only.',
		'Requires exact text replacement.',
		'Rejects ambiguous matches unless replaceAll is true.'
	],
	fetch: [
		'Fetches absolute http:// or https:// URLs from inside the worker sandbox.',
		'Returns text responses only.',
		'Truncates output to 20,000 characters by default.'
	],
	glob: [
		'Matches file paths under /agent only.',
		'Skips ignored directories such as .git and node_modules.',
		'Does not inspect app storage or host paths.'
	],
	grep: [
		'Searches readable sandbox roots only.',
		'Defaults to /agent and can search /config when addressed explicitly.',
		'Returns up to 40 matches by default.'
	],
	list: [
		'Lists directories under /agent by default.',
		'Can inspect /config only when addressed explicitly.',
		'Returns up to 80 entries by default.'
	],
	patch: [
		'Patches existing UTF-8 files under /agent only.',
		'Replaces inclusive line ranges.',
		'Rejects overlapping or out-of-range patches.'
	],
	question: [
		'Visible to the model so the interface stays consistent.',
		'Calls are denied until worker-to-daemon question round-trips are implemented.'
	],
	read: [
		'Reads UTF-8 text from /agent and /config only.',
		'Rejects paths outside the mounted agent roots and binary files.',
		'Returns at most 200 lines and 24,000 characters.'
	],
	remember: [
		'Executed by the daemon, not by the worker directly.',
		'Persists scratch, episodic, and long-term memory in the app database.',
		'Keeps database access outside the sandboxed worker.'
	],
	search: [
		'Searches file paths under /agent only.',
		'Can be scoped to a single sandbox path.',
		'Does not inspect app storage or host paths.'
	],
	skill: [
		'Executed by the daemon, not by the worker directly.',
		'Loads skills from app storage outside the sandbox.',
		'Rejects paths outside the chosen skill directory.'
	],
	todo: [
		'Executed by the daemon, not by the worker directly.',
		'Persists todos in the app database.',
		'Keeps database access outside the sandboxed worker.'
	],
	write: [
		'Creates or overwrites UTF-8 text under /agent only.',
		'Rejects writes outside the persistent agent root.',
		'Emits audit records for each successful mutation.'
	]
}

export type WorkerHostedToolExecutor = (toolName: WorkerHostedToolName, argumentsJson: string) => Promise<string>
export type WorkerToolAuthorizer = (toolName: string, argumentsJson: string) => Promise<ToolAuthorizationContext>

export const PHASE1_WORKER_TOOL_REGISTRY: RegisteredTool[] = createWorkerToolRegistry()

export function createWorkerToolRegistry(
	executeHostedTool?: WorkerHostedToolExecutor,
	authorizeToolCall?: WorkerToolAuthorizer
): RegisteredTool[] {
	return TOOL_REGISTRY.map(tool => {
		const execute = resolveWorkerToolExecutor(tool, executeHostedTool, authorizeToolCall)
		return {
			definition: tool.definition,
			execute,
			metadata: {
				category: tool.metadata.category,
				execution: tool.metadata.execution,
				restrictions: WORKER_TOOL_RESTRICTIONS[tool.name] ?? tool.metadata.restrictions,
				scope: SANDBOX_SCOPE
			},
			name: tool.name
		}
	})
}

function resolveWorkerToolExecutor(
	tool: RegisteredTool,
	executeHostedTool: WorkerHostedToolExecutor | undefined,
	authorizeToolCall: WorkerToolAuthorizer | undefined
): ToolExecutor {
	const denialMessage = DETERMINISTIC_DENIAL_MESSAGES.get(tool.name)
	if (denialMessage) {
		return () => createDeterministicDenial(denialMessage)
	}

	if (HOST_MANAGED_TOOL_NAMES.has(tool.name as WorkerHostedToolName)) {
		if (!executeHostedTool) {
			return () => createDeterministicDenial(`Tool "${tool.name}" requires daemon mediation.`)
		}

		return argumentsJson => executeHostedTool(tool.name as WorkerHostedToolName, argumentsJson)
	}

	if (!authorizeToolCall) {
		return () => createDeterministicDenial(`Tool "${tool.name}" requires daemon authorization.`)
	}

	return async (argumentsJson, context) => {
		try {
			const authorization = await authorizeToolCall(tool.name, argumentsJson)
			return await tool.execute(argumentsJson, mergeAuthorizedToolContext(context, authorization))
		} catch (error) {
			return createDeterministicDenial(error instanceof Error ? error.message : 'Unknown tool authorization error.')
		}
	}
}

function createDeterministicDenial(error: string): string {
	return JSON.stringify({ error, ok: false })
}

function mergeAuthorizedToolContext(
	context: Parameters<ToolExecutor>[1],
	authorization: ToolAuthorizationContext
): Parameters<ToolExecutor>[1] {
	return {
		...context,
		allowedMemoryKinds: authorization.allowedMemoryKinds ?? context.allowedMemoryKinds,
		allowedSkillNames: authorization.allowedSkillNames ?? context.allowedSkillNames,
		fileAccessPolicy: authorization.fileAccessPolicy ?? context.fileAccessPolicy,
		networkAccessPolicy: authorization.networkAccessPolicy ?? context.networkAccessPolicy,
		todoAllowed: authorization.todoAllowed ?? context.todoAllowed
	}
}
