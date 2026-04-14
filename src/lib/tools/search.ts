import { statSync } from 'node:fs'
import { resolve } from 'node:path'

import {
	getErrorMessage,
	getRequestedPath,
	isRecord,
	normalizeRelativePath,
	resolveWorkspacePath,
	resolveWorkspaceRoot,
	walkWorkspaceFiles
} from './common'
import type { ToolExecutionContext } from './tool-types'

const DEFAULT_MAX_RESULTS = 40

export const SEARCH_TOOL_NAME = 'search'

export const SEARCH_TOOL_DEFINITION = {
	function: {
		description: 'Search workspace file paths by partial file name or path.',
		name: SEARCH_TOOL_NAME,
		parameters: {
			additionalProperties: false,
			properties: {
				caseSensitive: { description: 'Use case-sensitive matching.', type: 'boolean' },
				maxResults: { description: 'Maximum number of file paths to return.', minimum: 1, type: 'integer' },
				path: { description: 'Optional workspace-relative file or directory to scope the search.', type: 'string' },
				query: { description: 'Substring to search for in file paths.', type: 'string' }
			},
			required: ['query'],
			type: 'object'
		},
		strict: true
	},
	type: 'function'
} as const

type SearchArguments = { caseSensitive?: boolean; maxResults?: number; path?: string; query: string }
type SearchErrorResult = { error: string; ok: false; path?: string }
type SearchSuccessResult = { matches: string[]; ok: true; query: string; truncated: boolean }

export type SearchResult = SearchErrorResult | SearchSuccessResult

export function executeSearchTool(argumentsJson: string, options: ToolExecutionContext = {}): string {
	try {
		const parsedArguments = JSON.parse(argumentsJson) as unknown
		return JSON.stringify(searchWorkspacePaths(parsedArguments, options))
	} catch (error) {
		return JSON.stringify({
			error: `Invalid search arguments: ${getErrorMessage(error)}`,
			ok: false
		} satisfies SearchErrorResult)
	}
}

export function searchWorkspacePaths(input: unknown, options: ToolExecutionContext = {}): SearchResult {
	try {
		const rootDirectory = resolveWorkspaceRoot(options.workspaceRoot)
		const argumentsValue = parseSearchArguments(input)
		const matches = filterSearchMatches(getCandidatePaths(rootDirectory, argumentsValue.path), argumentsValue)
		const maxResults = argumentsValue.maxResults ?? DEFAULT_MAX_RESULTS

		return {
			matches: matches.slice(0, maxResults),
			ok: true,
			query: argumentsValue.query,
			truncated: matches.length > maxResults
		}
	} catch (error) {
		return { error: getErrorMessage(error), ok: false, path: getRequestedPath(input) }
	}
}

function filterSearchMatches(paths: string[], argumentsValue: SearchArguments): string[] {
	const normalizedQuery = argumentsValue.caseSensitive ? argumentsValue.query : argumentsValue.query.toLowerCase()

	return paths.filter(path => {
		const candidate = argumentsValue.caseSensitive ? path : path.toLowerCase()
		return candidate.includes(normalizedQuery)
	})
}

function parseSearchArguments(input: unknown): SearchArguments {
	if (!isRecord(input)) {
		throw new Error('Arguments must be a JSON object.')
	}

	const query = input.query
	if (typeof query !== 'string' || !query.trim()) {
		throw new Error('query must be a non-empty string.')
	}

	const caseSensitive = input.caseSensitive
	if (caseSensitive !== undefined && typeof caseSensitive !== 'boolean') {
		throw new Error('caseSensitive must be a boolean when provided.')
	}

	const maxResults = input.maxResults
	if (maxResults !== undefined && (typeof maxResults !== 'number' || !Number.isInteger(maxResults) || maxResults < 1)) {
		throw new Error('maxResults must be a positive integer when provided.')
	}

	const path = input.path
	if (path !== undefined && (typeof path !== 'string' || !path.trim())) {
		throw new Error('path must be a non-empty string when provided.')
	}

	return { caseSensitive, maxResults, path, query: query.trim() }
}

function getCandidatePaths(rootDirectory: string, path?: string): string[] {
	if (!path?.trim()) {
		return walkWorkspaceFiles(rootDirectory)
	}

	const absolutePath = resolveWorkspacePath(rootDirectory, path.trim())
	const stats = statSync(absolutePath)

	if (stats.isDirectory()) {
		return walkWorkspaceFiles(absolutePath).map(filePath =>
			normalizeRelativePath(rootDirectory, resolve(absolutePath, filePath))
		)
	}

	return [normalizeRelativePath(rootDirectory, absolutePath)]
}
