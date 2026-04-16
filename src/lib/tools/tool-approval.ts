/* eslint-disable max-lines */

import type { WorkerHostMounts } from '../runtime/worker/types'
import type { ToolApprovalPrompt } from '../types'
import type { ToolPolicy } from './policy-types'

export function buildApprovalPrompt(
	approvalId: string,
	toolName: string,
	argumentsJson: string,
	denialReason: string
): ToolApprovalPrompt {
	return {
		approvalId,
		description: denialReason,
		requestedAccess: describeToolAuthorizationRequest(toolName, argumentsJson),
		toolArgumentsJson: argumentsJson,
		toolName
	}
}

export function buildToolApprovalFingerprint(toolName: string, argumentsJson: string): string {
	const input = parseJson(argumentsJson)
	switch (toolName) {
		case 'bash':
			return 'bash'
		case 'edit':
		case 'glob':
		case 'grep':
		case 'list':
		case 'patch':
		case 'read':
		case 'search':
		case 'write':
			return `${toolName}:${parseOptionalStringField(input, 'path') ?? '.'}`
		case 'fetch': {
			const url = parseOptionalStringField(input, 'url')
			if (!url) {
				return 'fetch'
			}

			try {
				return `fetch:${new URL(url).hostname.toLowerCase()}`
			} catch {
				return 'fetch'
			}
		}
		case 'remember':
			return `remember:${parseOptionalStringField(input, 'memory') ?? 'unknown'}`
		case 'skill':
			return `skill:${parseOptionalStringField(input, 'name') ?? parseOptionalStringField(input, 'action') ?? 'unknown'}`
		case 'todo':
			return 'todo'
		default:
			return toolName
	}
}

export function createToolApprovalGrantPolicy(
	toolName: string,
	argumentsJson: string,
	hostMounts: WorkerHostMounts
): ToolPolicy | null {
	const input = parseJson(argumentsJson)

	switch (toolName) {
		case 'bash':
			return createBooleanGrantPolicy('bash')
		case 'edit':
		case 'patch':
			return createEditableGrantPolicy(toolName, input, hostMounts)
		case 'read':
		case 'list':
		case 'grep':
		case 'search':
		case 'glob':
			return createReadGrantPolicy(toolName, input, hostMounts)
		case 'write':
			return createWriteGrantPolicy(input, hostMounts)
		case 'fetch':
			return createFetchGrantPolicy(input)
		case 'remember':
			return createRememberGrantPolicy(input)
		case 'skill':
			return createSkillGrantPolicy(input)
		case 'todo':
			return createBooleanGrantPolicy('todo')
		default:
			return null
	}
}

export function describeToolAuthorizationRequest(toolName: string, argumentsJson: string): string {
	const input = parseJson(argumentsJson)
	switch (toolName) {
		case 'bash':
			return 'Run a bash command inside the sandboxed worker.'
		case 'fetch': {
			const url = parseOptionalStringField(input, 'url')
			return url ? `Fetch ${url}.` : 'Fetch a remote URL.'
		}
		case 'remember': {
			const memoryKind = parseOptionalStringField(input, 'memory') ?? 'memory'
			return `Write to ${memoryKind} memory.`
		}
		case 'skill': {
			const skillName = parseOptionalStringField(input, 'name')
			return skillName ? `Use the "${skillName}" skill.` : 'Use a local skill.'
		}
		case 'todo':
			return 'Access the todo list.'
		default: {
			const path = parseOptionalStringField(input, 'path')
			return path ? `Access ${path}.` : `Run the "${toolName}" tool.`
		}
	}
}

export function isToolApprovalSuppressed(
	fingerprint: string,
	policy: ToolPolicy,
	sessionSuppressions: Set<string>
): boolean {
	return sessionSuppressions.has(fingerprint) || policy.promptSuppressions.includes(fingerprint)
}

export function mergeToolPolicies(base: ToolPolicy, override: ToolPolicy): ToolPolicy {
	return {
		promptSuppressions: Array.from(new Set([...base.promptSuppressions, ...override.promptSuppressions])),
		tools: {
			bash: { allowed: base.tools.bash.allowed || override.tools.bash.allowed },
			edit: {
				readRoots: union(base.tools.edit.readRoots, override.tools.edit.readRoots),
				writeRoots: union(base.tools.edit.writeRoots, override.tools.edit.writeRoots)
			},
			fetch: { allowedDomains: union(base.tools.fetch.allowedDomains, override.tools.fetch.allowedDomains) },
			glob: { readRoots: union(base.tools.glob.readRoots, override.tools.glob.readRoots) },
			grep: { readRoots: union(base.tools.grep.readRoots, override.tools.grep.readRoots) },
			list: { readRoots: union(base.tools.list.readRoots, override.tools.list.readRoots) },
			patch: {
				readRoots: union(base.tools.patch.readRoots, override.tools.patch.readRoots),
				writeRoots: union(base.tools.patch.writeRoots, override.tools.patch.writeRoots)
			},
			read: { readRoots: union(base.tools.read.readRoots, override.tools.read.readRoots) },
			remember: {
				allowedMemoryKinds: union(base.tools.remember.allowedMemoryKinds, override.tools.remember.allowedMemoryKinds)
			},
			search: { readRoots: union(base.tools.search.readRoots, override.tools.search.readRoots) },
			skill: { allowedSkillNames: union(base.tools.skill.allowedSkillNames, override.tools.skill.allowedSkillNames) },
			todo: { allowed: base.tools.todo.allowed || override.tools.todo.allowed },
			write: { writeRoots: union(base.tools.write.writeRoots, override.tools.write.writeRoots) }
		}
	}
}

function createEmptyPolicy(): ToolPolicy {
	return {
		promptSuppressions: [],
		tools: {
			bash: { allowed: false },
			edit: { readRoots: [], writeRoots: [] },
			fetch: { allowedDomains: [] },
			glob: { readRoots: [] },
			grep: { readRoots: [] },
			list: { readRoots: [] },
			patch: { readRoots: [], writeRoots: [] },
			read: { readRoots: [] },
			remember: { allowedMemoryKinds: [] },
			search: { readRoots: [] },
			skill: { allowedSkillNames: [] },
			todo: { allowed: false },
			write: { writeRoots: [] }
		}
	}
}

function createBooleanGrantPolicy(toolName: 'bash' | 'todo'): ToolPolicy {
	const policy = createEmptyPolicy()
	policy.tools[toolName].allowed = true
	return policy
}

function createEditableGrantPolicy(
	toolName: 'edit' | 'patch',
	input: unknown,
	hostMounts: WorkerHostMounts
): ToolPolicy | null {
	const root = inferVirtualRootFromPath(parseOptionalStringField(input, 'path'), hostMounts)
	if (!root) {
		return null
	}

	const policy = createEmptyPolicy()
	policy.tools[toolName].readRoots = [root]
	policy.tools[toolName].writeRoots = [root]
	return policy
}

function createFetchGrantPolicy(input: unknown): ToolPolicy | null {
	const url = parseOptionalStringField(input, 'url')
	if (!url) {
		return null
	}

	try {
		const policy = createEmptyPolicy()
		policy.tools.fetch.allowedDomains = [new URL(url).hostname.toLowerCase()]
		return policy
	} catch {
		return null
	}
}

function createReadGrantPolicy(
	toolName: 'glob' | 'grep' | 'list' | 'read' | 'search',
	input: unknown,
	hostMounts: WorkerHostMounts
): ToolPolicy {
	const policy = createEmptyPolicy()
	policy.tools[toolName].readRoots = [
		inferVirtualRootFromPath(parseOptionalStringField(input, 'path'), hostMounts) ?? '/agent'
	]
	return policy
}

function createRememberGrantPolicy(input: unknown): ToolPolicy | null {
	const memoryKind = parseOptionalStringField(input, 'memory')
	if (memoryKind !== 'scratch' && memoryKind !== 'episodic' && memoryKind !== 'long-term') {
		return null
	}

	const policy = createEmptyPolicy()
	policy.tools.remember.allowedMemoryKinds = [memoryKind]
	return policy
}

function createSkillGrantPolicy(input: unknown): ToolPolicy | null {
	const action = parseOptionalStringField(input, 'action')
	const skillName = parseOptionalStringField(input, 'name')
	const policy = createEmptyPolicy()

	if (action === 'list') {
		policy.tools.skill.allowedSkillNames = ['release-notes']
		return policy
	}

	if (!skillName) {
		return null
	}

	policy.tools.skill.allowedSkillNames = [skillName]
	return policy
}

function createWriteGrantPolicy(input: unknown, hostMounts: WorkerHostMounts): ToolPolicy | null {
	const root = inferVirtualRootFromPath(parseOptionalStringField(input, 'path'), hostMounts)
	if (!root) {
		return null
	}

	const policy = createEmptyPolicy()
	policy.tools.write.writeRoots = [root]
	return policy
}

function inferVirtualRootFromPath(path: string | undefined, hostMounts: WorkerHostMounts): '/agent' | '/config' | null {
	if (!path) {
		return '/agent'
	}
	if (!path.startsWith('/')) {
		return '/agent'
	}
	if (path === '/agent' || path.startsWith('/agent/')) {
		return '/agent'
	}
	if (path === '/config' || path.startsWith('/config/')) {
		return '/config'
	}
	if (path.startsWith(hostMounts.agentRoot)) {
		return '/agent'
	}
	if (path.startsWith(hostMounts.configRoot)) {
		return '/config'
	}
	return null
}

function parseJson(argumentsJson: string): unknown {
	try {
		return JSON.parse(argumentsJson) as unknown
	} catch {
		return null
	}
}

function parseOptionalStringField(input: unknown, key: string): string | undefined {
	if (typeof input !== 'object' || input === null || Array.isArray(input)) {
		return undefined
	}

	const value = (input as Record<string, unknown>)[key]
	return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function union<T extends string>(left: T[], right: T[]): T[] {
	return Array.from(new Set([...left, ...right]))
}
