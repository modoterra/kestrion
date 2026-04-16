import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path'

import type { AppPaths } from '../paths'
import type { ToolExecutionContext, ToolFileAccessPolicy } from './tool-types'

const IGNORED_DIRECTORIES = new Set(['.git', 'node_modules'])

export function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : 'Unknown tool error.'
}

export function getAppPaths(context: ToolExecutionContext): AppPaths {
	if (!context.appPaths) {
		throw new Error('This tool requires app storage paths.')
	}

	return context.appPaths
}

export function getRequestedPath(input: unknown): string | undefined {
	if (!isRecord(input)) {
		return undefined
	}

	return typeof input.path === 'string' ? input.path : undefined
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function normalizeRelativePath(rootDirectory: string, targetPath: string): string {
	return relative(rootDirectory, targetPath).replaceAll('\\', '/')
}

export function formatToolPath(context: ToolExecutionContext, path: string): string {
	const policy = context.fileAccessPolicy
	if (!policy) {
		const rootDirectory = resolveWorkspaceRoot(context.workspaceRoot)
		return normalizeRelativePath(rootDirectory, path) || '.'
	}

	if (path === policy.defaultReadRoot) {
		return '.'
	}

	const relativePath = relative(policy.defaultReadRoot, path).replaceAll('\\', '/')
	if (!relativePath.startsWith('..') && !isAbsolute(relativePath)) {
		return relativePath || '.'
	}

	return path
}

export function parseOptionalBoolean(value: unknown, fieldName: string): boolean | undefined {
	if (value === undefined) {
		return undefined
	}

	if (typeof value !== 'boolean') {
		throw new TypeError(`${fieldName} must be a boolean when provided.`)
	}

	return value
}

export function parseOptionalPositiveInteger(value: unknown, fieldName: string): number | undefined {
	if (value === undefined) {
		return undefined
	}

	if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
		throw new Error(`${fieldName} must be a positive integer.`)
	}

	return value
}

export function resolveWorkspaceRoot(rootDirectory?: string): string {
	return realpathSync(rootDirectory ?? process.cwd())
}

export function isIgnoredWorkspacePath(relativePath: string): boolean {
	return relativePath.split('/').some(segment => IGNORED_DIRECTORIES.has(segment))
}

export function resolveWorkspaceFilePath(
	rootDirectory: string,
	requestedPath: string,
	options: { allowMissing?: boolean } = {}
): string {
	const normalizedPath = resolveWorkspacePath(rootDirectory, requestedPath, options)

	assertPathIsInsideWorkspace(rootDirectory, normalizedPath, requestedPath)

	if (!options.allowMissing) {
		const stats = statSync(normalizedPath)
		if (!stats.isFile()) {
			throw new Error(`Path is not a file: ${requestedPath}`)
		}
	}

	return normalizedPath
}

export function resolveToolDirectoryPath(
	context: ToolExecutionContext,
	requestedPath?: string,
	options: { allowMissing?: boolean; write?: boolean } = {}
): string {
	const policy = context.fileAccessPolicy
	if (!policy) {
		const rootDirectory = resolveWorkspaceRoot(context.workspaceRoot)
		return requestedPath?.trim()
			? resolveWorkspacePath(rootDirectory, requestedPath.trim(), { allowMissing: options.allowMissing })
			: rootDirectory
	}

	const path = requestedPath?.trim() || policy.defaultReadRoot
	return resolveFileAccessPath(policy, path, { allowMissing: options.allowMissing, write: options.write })
}

export function resolveToolFilePath(
	context: ToolExecutionContext,
	requestedPath: string,
	options: { allowMissing?: boolean; write?: boolean } = {}
): string {
	const policy = context.fileAccessPolicy
	if (!policy) {
		const rootDirectory = resolveWorkspaceRoot(context.workspaceRoot)
		return resolveWorkspaceFilePath(rootDirectory, requestedPath, { allowMissing: options.allowMissing })
	}

	const filePath = resolveFileAccessPath(policy, requestedPath, {
		allowMissing: options.allowMissing,
		write: options.write
	})
	if (!options.allowMissing) {
		const stats = statSync(filePath)
		if (!stats.isFile()) {
			throw new Error(`Path is not a file: ${requestedPath}`)
		}
	}

	return filePath
}

export function readWorkspaceTextFile(filePath: string): string {
	const fileBuffer = readFileSync(filePath)
	if (fileBuffer.includes(0)) {
		throw new Error('Binary files are not supported by this tool.')
	}

	return fileBuffer.toString('utf8')
}

export function splitLines(content: string): string[] {
	if (!content) {
		return []
	}

	const normalizedContent = content.replaceAll('\r\n', '\n')
	const lines = normalizedContent.split('\n')

	return normalizedContent.endsWith('\n') ? lines.slice(0, -1) : lines
}

export function walkWorkspaceFiles(rootDirectory: string): string[] {
	return collectWorkspaceFilePaths(rootDirectory).map(path => normalizeRelativePath(rootDirectory, path))
}

export function walkToolFiles(rootDirectory: string, context: ToolExecutionContext): string[] {
	return collectWorkspaceFilePaths(rootDirectory).map(path => formatToolPath(context, path))
}

function assertPathIsInsideWorkspace(rootDirectory: string, candidatePath: string, requestedPath: string): void {
	const realCandidatePath = existsSync(candidatePath) ? realpathSync(candidatePath) : candidatePath
	const relativePath = relative(rootDirectory, realCandidatePath)

	if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
		throw new Error(`Path is outside the workspace root: ${requestedPath}`)
	}
}

function collectWorkspaceFilePaths(currentDirectory: string): string[] {
	const entries = readdirSync(currentDirectory, { withFileTypes: true })
	const files: string[] = []

	for (const entry of entries) {
		if (entry.isDirectory()) {
			if (IGNORED_DIRECTORIES.has(entry.name)) {
				continue
			}

			files.push(...collectWorkspaceFilePaths(resolve(currentDirectory, entry.name)))
			continue
		}

		if (!entry.isFile()) {
			continue
		}

		files.push(resolve(currentDirectory, entry.name))
	}

	return files
}

function assertPathIsInsideRoots(candidatePath: string, allowedRoots: string[], requestedPath: string): string {
	const realCandidatePath = existsSync(candidatePath) ? realpathSync(candidatePath) : candidatePath
	for (const allowedRoot of allowedRoots) {
		const relativePath = relative(allowedRoot, realCandidatePath)
		if (!relativePath.startsWith('..') && !isAbsolute(relativePath)) {
			return realCandidatePath
		}
	}

	throw new Error(`Path is outside the allowed roots: ${requestedPath}`)
}

function requireExistingPath(candidatePath: string, requestedPath: string): string {
	if (!existsSync(candidatePath)) {
		throw new Error(`Path not found: ${requestedPath}`)
	}

	return realpathSync(candidatePath)
}

export function resolveWorkspacePath(
	rootDirectory: string,
	requestedPath: string,
	options: { allowMissing?: boolean } = {}
): string {
	const candidatePath = isAbsolute(requestedPath) ? requestedPath : resolve(rootDirectory, requestedPath)
	const resolvedPath = options.allowMissing ? candidatePath : requireExistingPath(candidatePath, requestedPath)
	assertPathIsInsideWorkspace(rootDirectory, resolvedPath, requestedPath)

	return resolvedPath
}

function resolveFileAccessPath(
	policy: ToolFileAccessPolicy,
	requestedPath: string,
	options: { allowMissing?: boolean; write?: boolean } = {}
): string {
	const allowedRoots = options.write ? policy.writeRoots : policy.readRoots
	const candidatePath = isAbsolute(requestedPath)
		? resolve(requestedPath)
		: resolve(policy.defaultReadRoot, requestedPath)

	if (options.allowMissing) {
		if (existsSync(candidatePath)) {
			return assertPathIsInsideRoots(realpathSync(candidatePath), allowedRoots, requestedPath)
		}

		const parentDirectory = realpathSync(dirname(candidatePath))
		assertPathIsInsideRoots(parentDirectory, allowedRoots, requestedPath)
		return resolve(parentDirectory, basename(candidatePath))
	}

	if (!existsSync(candidatePath)) {
		throw new Error(`Path not found: ${requestedPath}`)
	}

	return assertPathIsInsideRoots(realpathSync(candidatePath), allowedRoots, requestedPath)
}
