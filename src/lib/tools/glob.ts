import { resolve } from 'node:path'

import {
	formatToolPath,
	getErrorMessage,
	isIgnoredWorkspacePath,
	isRecord,
	parseOptionalPositiveInteger,
	resolveToolDirectoryPath
} from './common'
import type { ToolExecutionContext } from './tool-types'

const DEFAULT_MAX_RESULTS = 80

export const GLOB_TOOL_NAME = 'glob'

export const GLOB_TOOL_DEFINITION = {
	function: {
		description: 'Search workspace files using a glob pattern.',
		name: GLOB_TOOL_NAME,
		parameters: {
			additionalProperties: false,
			properties: {
				maxResults: { description: 'Maximum number of matching file paths to return.', minimum: 1, type: 'integer' },
				path: { description: 'Optional workspace-relative directory to scan.', type: 'string' },
				pattern: { description: 'Glob pattern to match, such as **/*.ts or src/**/test-*.tsx.', type: 'string' }
			},
			required: ['pattern'],
			type: 'object'
		},
		strict: true
	},
	type: 'function'
} as const

type GlobArguments = { maxResults?: number; path?: string; pattern: string }
type GlobErrorResult = { error: string; ok: false; path?: string }
type GlobSuccessResult = { matches: string[]; ok: true; pattern: string; truncated: boolean }

export type GlobResult = GlobErrorResult | GlobSuccessResult

export function executeGlobTool(argumentsJson: string, options: ToolExecutionContext = {}): string {
	try {
		const parsedArguments = JSON.parse(argumentsJson) as unknown
		return JSON.stringify(globWorkspacePaths(parsedArguments, options))
	} catch (error) {
		return JSON.stringify({
			error: `Invalid glob arguments: ${getErrorMessage(error)}`,
			ok: false
		} satisfies GlobErrorResult)
	}
}

export function globWorkspacePaths(input: unknown, options: ToolExecutionContext = {}): GlobResult {
	try {
		const argumentsValue = parseGlobArguments(input)
		const scopeDirectory = resolveToolDirectoryPath(options, argumentsValue.path?.trim())
		const matches = Array.from(new Bun.Glob(argumentsValue.pattern).scanSync({ cwd: scopeDirectory, dot: true }))
			.map(path => formatToolPath(options, resolve(scopeDirectory, path)))
			.filter(path => !isIgnoredWorkspacePath(path))
			.toSorted((left, right) => left.localeCompare(right))
		const maxResults = argumentsValue.maxResults ?? DEFAULT_MAX_RESULTS

		return {
			matches: matches.slice(0, maxResults),
			ok: true,
			pattern: argumentsValue.pattern,
			truncated: matches.length > maxResults
		}
	} catch (error) {
		return {
			error: getErrorMessage(error),
			ok: false,
			path:
				typeof input === 'object' && input && 'path' in input && typeof input.path === 'string' ? input.path : undefined
		}
	}
}

function parseGlobArguments(input: unknown): GlobArguments {
	if (!isRecord(input)) {
		throw new Error('Arguments must be a JSON object.')
	}

	const pattern = input.pattern
	if (typeof pattern !== 'string' || !pattern.trim()) {
		throw new Error('pattern must be a non-empty string.')
	}

	const path = input.path
	if (path !== undefined && (typeof path !== 'string' || !path.trim())) {
		throw new Error('path must be a non-empty string when provided.')
	}

	return { maxResults: parseOptionalPositiveInteger(input.maxResults, 'maxResults'), path, pattern: pattern.trim() }
}
