import type { ToolFileAccessPolicy, ToolMemoryKind, ToolNetworkAccessPolicy } from './tool-types'

type ToolPolicyBooleanRule = { allowed: boolean }
type ToolPolicyFileEditRule = { readRoots: string[]; writeRoots: string[] }
type ToolPolicyFileReadRule = { readRoots: string[] }
type ToolPolicyFileWriteRule = { writeRoots: string[] }
type ToolPolicyFetchRule = { allowedDomains: string[] }
type ToolPolicyRememberRule = { allowedMemoryKinds: ToolMemoryKind[] }
type ToolPolicySkillRule = { allowedSkillNames: string[] }

export type ToolPolicy = {
	promptSuppressions: string[]
	tools: {
		bash: ToolPolicyBooleanRule
		edit: ToolPolicyFileEditRule
		fetch: ToolPolicyFetchRule
		glob: ToolPolicyFileReadRule
		grep: ToolPolicyFileReadRule
		list: ToolPolicyFileReadRule
		patch: ToolPolicyFileEditRule
		read: ToolPolicyFileReadRule
		remember: ToolPolicyRememberRule
		search: ToolPolicyFileReadRule
		skill: ToolPolicySkillRule
		todo: ToolPolicyBooleanRule
		write: ToolPolicyFileWriteRule
	}
}

export type ToolAuthorizationContext = {
	allowedMemoryKinds?: ToolMemoryKind[]
	allowedSkillNames?: string[]
	fileAccessPolicy?: ToolFileAccessPolicy
	networkAccessPolicy?: ToolNetworkAccessPolicy
	todoAllowed?: boolean
}

export const DENY_ALL_TOOL_POLICY: ToolPolicy = {
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

export function createTestingToolPolicy(): ToolPolicy {
	return {
		promptSuppressions: [],
		tools: {
			bash: { allowed: false },
			edit: { readRoots: ['/agent'], writeRoots: ['/agent'] },
			fetch: { allowedDomains: ['example.com', 'fireworks.ai', 'github.com'] },
			glob: { readRoots: ['/agent'] },
			grep: { readRoots: ['/agent', '/config'] },
			list: { readRoots: ['/agent', '/config'] },
			patch: { readRoots: ['/agent'], writeRoots: ['/agent'] },
			read: { readRoots: ['/agent', '/config'] },
			remember: { allowedMemoryKinds: ['scratch', 'episodic', 'long-term'] },
			search: { readRoots: ['/agent'] },
			skill: { allowedSkillNames: ['release-notes'] },
			todo: { allowed: true },
			write: { writeRoots: ['/agent'] }
		}
	}
}

export function normalizeToolPolicy(value: unknown): ToolPolicy {
	if (!isRecord(value)) {
		return DENY_ALL_TOOL_POLICY
	}

	const tools = isRecord(value.tools) ? value.tools : {}

	return {
		promptSuppressions: normalizeStringList(value.promptSuppressions),
		tools: {
			bash: { allowed: normalizeBoolean((tools.bash as { allowed?: unknown } | undefined)?.allowed) },
			edit: {
				readRoots: normalizeVirtualRoots((tools.edit as { readRoots?: unknown } | undefined)?.readRoots),
				writeRoots: normalizeVirtualRoots((tools.edit as { writeRoots?: unknown } | undefined)?.writeRoots)
			},
			fetch: {
				allowedDomains: normalizeHostnames((tools.fetch as { allowedDomains?: unknown } | undefined)?.allowedDomains)
			},
			glob: { readRoots: normalizeVirtualRoots((tools.glob as { readRoots?: unknown } | undefined)?.readRoots) },
			grep: { readRoots: normalizeVirtualRoots((tools.grep as { readRoots?: unknown } | undefined)?.readRoots) },
			list: { readRoots: normalizeVirtualRoots((tools.list as { readRoots?: unknown } | undefined)?.readRoots) },
			patch: {
				readRoots: normalizeVirtualRoots((tools.patch as { readRoots?: unknown } | undefined)?.readRoots),
				writeRoots: normalizeVirtualRoots((tools.patch as { writeRoots?: unknown } | undefined)?.writeRoots)
			},
			read: { readRoots: normalizeVirtualRoots((tools.read as { readRoots?: unknown } | undefined)?.readRoots) },
			remember: {
				allowedMemoryKinds: normalizeMemoryKinds(
					(tools.remember as { allowedMemoryKinds?: unknown } | undefined)?.allowedMemoryKinds
				)
			},
			search: { readRoots: normalizeVirtualRoots((tools.search as { readRoots?: unknown } | undefined)?.readRoots) },
			skill: {
				allowedSkillNames: normalizeStringList(
					(tools.skill as { allowedSkillNames?: unknown } | undefined)?.allowedSkillNames
				)
			},
			todo: { allowed: normalizeBoolean((tools.todo as { allowed?: unknown } | undefined)?.allowed) },
			write: { writeRoots: normalizeVirtualRoots((tools.write as { writeRoots?: unknown } | undefined)?.writeRoots) }
		}
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeBoolean(value: unknown): boolean {
	return value === true
}

function normalizeHostnames(value: unknown): string[] {
	return normalizeStringList(value)
		.map(hostname => hostname.toLowerCase())
		.filter(hostname => /^[a-z0-9.-]+$/.test(hostname))
}

function normalizeMemoryKinds(value: unknown): ToolMemoryKind[] {
	return normalizeStringList(value).filter(
		(memoryKind): memoryKind is ToolMemoryKind =>
			memoryKind === 'episodic' || memoryKind === 'long-term' || memoryKind === 'scratch'
	)
}

function normalizeStringList(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return []
	}

	return Array.from(
		new Set(
			value.filter((entry): entry is string => typeof entry === 'string' && !!entry.trim()).map(entry => entry.trim())
		)
	)
}

function normalizeVirtualRoots(value: unknown): string[] {
	return normalizeStringList(value).filter(root => root === '/agent' || root === '/config')
}
