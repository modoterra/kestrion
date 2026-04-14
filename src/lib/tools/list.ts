import { readdirSync, statSync } from 'node:fs'

import {
	getErrorMessage,
	getRequestedPath,
	isRecord,
	normalizeRelativePath,
	parseOptionalBoolean,
	parseOptionalPositiveInteger,
	resolveWorkspacePath,
	resolveWorkspaceRoot
} from './common'
import type { ToolExecutionContext } from './tool-types'

const DEFAULT_MAX_RESULTS = 80

export const LIST_TOOL_NAME = 'list'

export const LIST_TOOL_DEFINITION = {
	function: {
		description: 'List files and directories in the current workspace.',
		name: LIST_TOOL_NAME,
		parameters: {
			additionalProperties: false,
			properties: {
				directoriesOnly: { description: 'Return directories only.', type: 'boolean' },
				filesOnly: { description: 'Return files only.', type: 'boolean' },
				maxResults: { description: 'Maximum number of entries to return.', minimum: 1, type: 'integer' },
				path: { description: 'Workspace-relative directory to list. Defaults to the workspace root.', type: 'string' }
			},
			type: 'object'
		},
		strict: true
	},
	type: 'function'
} as const

type ListArguments = { directoriesOnly?: boolean; filesOnly?: boolean; maxResults?: number; path?: string }
type ListEntry = { name: string; path: string; type: 'directory' | 'file' }
type ListErrorResult = { error: string; ok: false; path?: string }
type ListSuccessResult = { entries: ListEntry[]; ok: true; path: string; truncated: boolean }

export type ListResult = ListErrorResult | ListSuccessResult

export function executeListTool(argumentsJson: string, options: ToolExecutionContext = {}): string {
	try {
		const parsedArguments = JSON.parse(argumentsJson) as unknown
		return JSON.stringify(listWorkspacePaths(parsedArguments, options))
	} catch (error) {
		return JSON.stringify({
			error: `Invalid list arguments: ${getErrorMessage(error)}`,
			ok: false
		} satisfies ListErrorResult)
	}
}

export function listWorkspacePaths(input: unknown, options: ToolExecutionContext = {}): ListResult {
	try {
		const rootDirectory = resolveWorkspaceRoot(options.workspaceRoot)
		const argumentsValue = parseListArguments(input)
		const directoryPath = argumentsValue.path?.trim()
			? resolveWorkspacePath(rootDirectory, argumentsValue.path.trim())
			: rootDirectory
		if (!statSync(directoryPath).isDirectory()) {
			throw new Error(`Path is not a directory: ${argumentsValue.path ?? '.'}`)
		}

		const entries = readdirSync(directoryPath, { withFileTypes: true })
			.filter(entry => {
				if (argumentsValue.directoriesOnly) {
					return entry.isDirectory()
				}

				if (argumentsValue.filesOnly) {
					return entry.isFile()
				}

				return entry.isDirectory() || entry.isFile()
			})
			.map<ListEntry>(entry => ({
				name: entry.name,
				path: normalizeRelativePath(rootDirectory, `${directoryPath}/${entry.name}`),
				type: entry.isDirectory() ? 'directory' : 'file'
			}))
			.toSorted((left, right) => left.path.localeCompare(right.path))
		const maxResults = argumentsValue.maxResults ?? DEFAULT_MAX_RESULTS

		return {
			entries: entries.slice(0, maxResults),
			ok: true,
			path: normalizeRelativePath(rootDirectory, directoryPath) || '.',
			truncated: entries.length > maxResults
		}
	} catch (error) {
		return { error: getErrorMessage(error), ok: false, path: getRequestedPath(input) }
	}
}

function parseListArguments(input: unknown): ListArguments {
	if (input === undefined || input === null) {
		return {}
	}

	if (!isRecord(input)) {
		throw new Error('Arguments must be a JSON object.')
	}

	const path = input.path
	if (path !== undefined && (typeof path !== 'string' || !path.trim())) {
		throw new Error('path must be a non-empty string when provided.')
	}

	const directoriesOnly = parseOptionalBoolean(input.directoriesOnly, 'directoriesOnly')
	const filesOnly = parseOptionalBoolean(input.filesOnly, 'filesOnly')
	if (directoriesOnly && filesOnly) {
		throw new Error('directoriesOnly and filesOnly cannot both be true.')
	}

	return { directoriesOnly, filesOnly, maxResults: parseOptionalPositiveInteger(input.maxResults, 'maxResults'), path }
}
