import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'

import type { AppPaths } from '../paths'
import type { ToolExecutionContext } from './tool-types'

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
