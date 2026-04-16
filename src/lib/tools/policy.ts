/* eslint-disable max-lines */

import { existsSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'

import type { WorkerHostMounts } from '../runtime/worker/types'
import {
	DENY_ALL_TOOL_POLICY,
	createTestingToolPolicy,
	normalizeToolPolicy,
	type ToolAuthorizationContext,
	type ToolPolicy
} from './policy-types'
import type { ToolMemoryKind } from './tool-types'
export {
	DENY_ALL_TOOL_POLICY,
	createTestingToolPolicy,
	normalizeToolPolicy,
	type ToolAuthorizationContext,
	type ToolPolicy
}

type FileReadToolName = 'glob' | 'grep' | 'list' | 'read' | 'search'

export type ToolAuthorizationResult = { context: ToolAuthorizationContext; ok: true } | { error: string; ok: false }

export function authorizeToolCall(
	toolName: string,
	argumentsJson: string,
	policy: ToolPolicy,
	hostMounts: WorkerHostMounts
): ToolAuthorizationResult {
	let input: unknown
	try {
		input = JSON.parse(argumentsJson)
	} catch {
		return { error: `Tool "${toolName}" could not be authorized because its arguments were invalid JSON.`, ok: false }
	}

	switch (toolName) {
		case 'bash':
			return denyTool(toolName, 'Tool "bash" is disabled by policy.')
		case 'read':
		case 'list':
		case 'grep':
		case 'search':
		case 'glob':
			return authorizeFileReadTool(toolName, input, policy, hostMounts)
		case 'write':
			return authorizeFileWriteTool(input, policy, hostMounts)
		case 'edit':
		case 'patch':
			return authorizeEditableFileTool(toolName, input, policy, hostMounts)
		case 'fetch':
			return authorizeFetchTool(input, policy)
		case 'remember':
			return authorizeRememberTool(input, policy)
		case 'skill':
			return authorizeSkillTool(input, policy)
		case 'todo':
			return policy.tools.todo.allowed
				? { context: { todoAllowed: true }, ok: true }
				: denyTool(toolName, 'Tool "todo" is denied by policy.')
		default:
			return denyTool(toolName, `Tool "${toolName}" is denied by policy.`)
	}
}

function authorizeEditableFileTool(
	toolName: 'edit' | 'patch',
	input: unknown,
	policy: ToolPolicy,
	hostMounts: WorkerHostMounts
): ToolAuthorizationResult {
	const requestedPath = parseRequiredPath(input)
	if (!requestedPath) {
		return denyTool(toolName, `Tool "${toolName}" requires a non-empty "path".`)
	}

	const rule = policy.tools[toolName]
	if (rule.readRoots.length === 0 || rule.writeRoots.length === 0) {
		return denyTool(toolName, `Tool "${toolName}" is denied by policy.`)
	}

	const authorizedReadRoot = authorizeRequestedPath(requestedPath, rule.readRoots, hostMounts)
	if (!authorizedReadRoot.ok) {
		return authorizedReadRoot
	}

	const authorizedWriteRoot = authorizeRequestedPath(requestedPath, rule.writeRoots, hostMounts)
	if (!authorizedWriteRoot.ok) {
		return authorizedWriteRoot
	}

	return {
		context: {
			fileAccessPolicy: {
				defaultReadRoot: authorizedReadRoot.defaultRoot,
				readRoots: rule.readRoots,
				writeRoots: rule.writeRoots
			}
		},
		ok: true
	}
}

function authorizeFetchTool(input: unknown, policy: ToolPolicy): ToolAuthorizationResult {
	const url = parseUrl(input)
	if (!url) {
		return denyTool('fetch', 'Tool "fetch" requires a valid absolute HTTP(S) URL.')
	}

	const hostname = url.hostname.toLowerCase()
	if (!policy.tools.fetch.allowedDomains.includes(hostname)) {
		return denyTool('fetch', `Domain "${hostname}" is denied by policy for tool "fetch".`)
	}

	return { context: { networkAccessPolicy: { allowedDomains: [hostname] } }, ok: true }
}

function authorizeFileReadTool(
	toolName: FileReadToolName,
	input: unknown,
	policy: ToolPolicy,
	hostMounts: WorkerHostMounts
): ToolAuthorizationResult {
	const readRoots = policy.tools[toolName].readRoots
	if (readRoots.length === 0) {
		return denyTool(toolName, `Tool "${toolName}" is denied by policy.`)
	}

	const requestedPath = parseOptionalPath(input)
	const authorizedPath = requestedPath
		? authorizeRequestedPath(requestedPath, readRoots, hostMounts)
		: { defaultRoot: readRoots[0] ?? '/agent', ok: true as const }

	if (!authorizedPath.ok) {
		return authorizedPath
	}

	return {
		context: { fileAccessPolicy: { defaultReadRoot: authorizedPath.defaultRoot, readRoots, writeRoots: [] } },
		ok: true
	}
}

function authorizeFileWriteTool(
	input: unknown,
	policy: ToolPolicy,
	hostMounts: WorkerHostMounts
): ToolAuthorizationResult {
	const requestedPath = parseRequiredPath(input)
	if (!requestedPath) {
		return denyTool('write', 'Tool "write" requires a non-empty "path".')
	}

	const writeRoots = policy.tools.write.writeRoots
	if (writeRoots.length === 0) {
		return denyTool('write', 'Tool "write" is denied by policy.')
	}

	const authorizedPath = authorizeRequestedPath(requestedPath, writeRoots, hostMounts, true)
	if (!authorizedPath.ok) {
		return authorizedPath
	}

	return {
		context: { fileAccessPolicy: { defaultReadRoot: authorizedPath.defaultRoot, readRoots: writeRoots, writeRoots } },
		ok: true
	}
}

function authorizeRememberTool(input: unknown, policy: ToolPolicy): ToolAuthorizationResult {
	const memoryKind = parseMemoryKind(input)
	if (!memoryKind) {
		return denyTool('remember', 'Tool "remember" requires a valid "memory" kind.')
	}

	if (!policy.tools.remember.allowedMemoryKinds.includes(memoryKind)) {
		return denyTool('remember', `Memory kind "${memoryKind}" is denied by policy for tool "remember".`)
	}

	return { context: { allowedMemoryKinds: [memoryKind] }, ok: true }
}

function authorizeRequestedPath(
	requestedPath: string,
	allowedVirtualRoots: string[],
	hostMounts: WorkerHostMounts,
	allowMissing = false
): { defaultRoot: string; ok: true } | { error: string; ok: false } {
	for (const allowedVirtualRoot of allowedVirtualRoots) {
		const hostRoot = mapVirtualRootToHostPath(allowedVirtualRoot, hostMounts)
		if (!hostRoot) {
			continue
		}

		try {
			resolveAuthorizedHostPath(requestedPath, allowedVirtualRoot, hostRoot, allowMissing)
			return { defaultRoot: allowedVirtualRoot, ok: true }
		} catch {
			continue
		}
	}

	return { error: `Path "${requestedPath}" is denied by policy.`, ok: false }
}

function authorizeSkillTool(input: unknown, policy: ToolPolicy): ToolAuthorizationResult {
	const action = parseOptionalStringField(input, 'action')
	const allowedSkillNames = policy.tools.skill.allowedSkillNames
	if (allowedSkillNames.length === 0) {
		return denyTool('skill', 'Tool "skill" is denied by policy.')
	}

	if (action === 'invoke') {
		const name = parseOptionalStringField(input, 'name')
		if (!name) {
			return denyTool('skill', 'Tool "skill" requires a non-empty "name" for action "invoke".')
		}
		if (!isAllowedSkillName(name, allowedSkillNames)) {
			return denyTool('skill', `Skill "${name}" is denied by policy.`)
		}
	}

	return { context: { allowedSkillNames }, ok: true }
}

function denyTool(toolName: string, error: string): ToolAuthorizationResult {
	return { error: error || `Tool "${toolName}" is denied by policy.`, ok: false }
}

function findNearestExistingDirectory(candidatePath: string): string {
	let currentPath = candidatePath
	while (!existsSync(currentPath)) {
		const parentPath = dirname(currentPath)
		if (parentPath === currentPath) {
			throw new Error(`Path does not exist: ${candidatePath}`)
		}
		currentPath = parentPath
	}

	return realpathSync(currentPath)
}

function isAllowedSkillName(name: string, allowedSkillNames: string[]): boolean {
	return allowedSkillNames.includes(name)
}

function mapVirtualRootToHostPath(virtualRoot: string, hostMounts: WorkerHostMounts): string | null {
	switch (virtualRoot) {
		case '/agent':
			return realpathSync(hostMounts.agentRoot)
		case '/config':
			return realpathSync(hostMounts.configRoot)
		default:
			return null
	}
}

function parseMemoryKind(input: unknown): ToolMemoryKind | undefined {
	const memoryKind = parseOptionalStringField(input, 'memory')
	return memoryKind === 'episodic' || memoryKind === 'long-term' || memoryKind === 'scratch' ? memoryKind : undefined
}

function parseOptionalPath(input: unknown): string | undefined {
	return parseOptionalStringField(input, 'path')
}

function parseOptionalStringField(input: unknown, key: string): string | undefined {
	if (typeof input !== 'object' || input === null || Array.isArray(input)) {
		return undefined
	}

	const value = (input as Record<string, unknown>)[key]
	return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function parseRequiredPath(input: unknown): string | undefined {
	return parseOptionalStringField(input, 'path')
}

function parseUrl(input: unknown): URL | undefined {
	const rawUrl = parseOptionalStringField(input, 'url')
	if (!rawUrl) {
		return undefined
	}

	try {
		const parsedUrl = new URL(rawUrl)
		if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
			return undefined
		}

		return parsedUrl
	} catch {
		return undefined
	}
}

function resolveAuthorizedHostPath(
	requestedPath: string,
	virtualRoot: string,
	hostRoot: string,
	allowMissing: boolean
): string {
	const candidatePath = resolveHostPath(requestedPath, virtualRoot, hostRoot)
	const realCandidatePath = allowMissing
		? existsSync(candidatePath)
			? realpathSync(candidatePath)
			: resolve(findNearestExistingDirectory(dirname(candidatePath)), requestedPath.split('/').at(-1) ?? '')
		: realpathSync(candidatePath)
	const relativePath = relative(hostRoot, realCandidatePath)

	if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
		throw new Error(`Path is outside the allowed roots: ${requestedPath}`)
	}

	return realCandidatePath
}

function resolveHostPath(requestedPath: string, virtualRoot: string, hostRoot: string): string {
	if (requestedPath.startsWith('/')) {
		if (requestedPath === virtualRoot || requestedPath.startsWith(`${virtualRoot}/`)) {
			return resolve(hostRoot, requestedPath.slice(virtualRoot.length))
		}

		throw new Error(`Path is outside the mounted roots: ${requestedPath}`)
	}

	return resolve(hostRoot, requestedPath)
}
