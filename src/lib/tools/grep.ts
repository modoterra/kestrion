import { spawnSync } from 'node:child_process'
import { statSync } from 'node:fs'
import { resolve } from 'node:path'

import {
	getErrorMessage,
	getRequestedPath,
	isRecord,
	normalizeRelativePath,
	parseOptionalBoolean,
	parseOptionalPositiveInteger,
	readWorkspaceTextFile,
	resolveWorkspacePath,
	resolveWorkspaceRoot,
	splitLines,
	walkWorkspaceFiles
} from './common'
import type { ToolExecutionContext } from './tool-types'

const DEFAULT_MAX_RESULTS = 40

export const GREP_TOOL_NAME = 'grep'

export const GREP_TOOL_DEFINITION = {
	function: {
		description: 'Search workspace file contents for matching text and return matching lines.',
		name: GREP_TOOL_NAME,
		parameters: {
			additionalProperties: false,
			properties: {
				caseSensitive: { description: 'Use case-sensitive matching.', type: 'boolean' },
				maxResults: { description: 'Maximum number of matching lines to return.', minimum: 1, type: 'integer' },
				path: { description: 'Optional workspace-relative file or directory to limit the search.', type: 'string' },
				query: { description: 'Text to search for.', type: 'string' },
				regex: { description: 'Treat query as a regular expression.', type: 'boolean' }
			},
			required: ['query'],
			type: 'object'
		},
		strict: true
	},
	type: 'function'
} as const

type GrepArguments = { caseSensitive?: boolean; maxResults?: number; path?: string; query: string; regex?: boolean }
type GrepErrorResult = { error: string; ok: false; path?: string }
type GrepMatch = { line: number; path: string; text: string }
type GrepSuccessResult = { matches: GrepMatch[]; ok: true; query: string; truncated: boolean }

export type GrepResult = GrepErrorResult | GrepSuccessResult

export function executeGrepTool(argumentsJson: string, options: ToolExecutionContext = {}): string {
	try {
		const parsedArguments = JSON.parse(argumentsJson) as unknown
		return JSON.stringify(grepWorkspace(parsedArguments, options))
	} catch (error) {
		return JSON.stringify({
			error: `Invalid grep arguments: ${getErrorMessage(error)}`,
			ok: false
		} satisfies GrepErrorResult)
	}
}

export function grepWorkspace(input: unknown, options: ToolExecutionContext = {}): GrepResult {
	try {
		const rootDirectory = resolveWorkspaceRoot(options.workspaceRoot)
		const argumentsValue = parseGrepArguments(input)
		const matches = grepWithRipgrep(rootDirectory, argumentsValue) ?? grepWithFallback(rootDirectory, argumentsValue)
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

function grepWithFallback(rootDirectory: string, argumentsValue: GrepArguments): GrepMatch[] {
	const matcher = createLineMatcher(argumentsValue)
	const matches: GrepMatch[] = []
	const files = selectCandidateFiles(rootDirectory, argumentsValue.path)
	const maxResults = argumentsValue.maxResults ?? DEFAULT_MAX_RESULTS

	for (const relativePath of files) {
		const absolutePath = resolveWorkspacePath(rootDirectory, relativePath)
		const lines = splitLines(readWorkspaceTextFile(absolutePath))

		for (const [index, line] of lines.entries()) {
			if (!matcher(line)) {
				continue
			}

			matches.push({ line: index + 1, path: relativePath, text: line })
			if (matches.length >= maxResults) {
				return matches
			}
		}
	}

	return matches
}

function grepWithRipgrep(rootDirectory: string, argumentsValue: GrepArguments): GrepMatch[] | null {
	const result = spawnSync('rg', buildRipgrepArgs(rootDirectory, argumentsValue), { encoding: 'utf8' })
	if (result.error || (result.status !== 0 && result.status !== 1)) {
		return null
	}

	const matches: GrepMatch[] = []
	const maxResults = argumentsValue.maxResults ?? DEFAULT_MAX_RESULTS

	for (const line of result.stdout.split('\n')) {
		if (!line.trim()) {
			continue
		}

		const parsedLine = JSON.parse(line) as {
			data?: { line_number?: number; lines?: { text?: string }; path?: { text?: string } }
			type?: string
		}
		if (parsedLine.type !== 'match') {
			continue
		}

		const matchPath = parsedLine.data?.path?.text
		if (!matchPath) {
			continue
		}

		matches.push({
			line: parsedLine.data?.line_number ?? 0,
			path: normalizeRipgrepPath(rootDirectory, matchPath),
			text: (parsedLine.data?.lines?.text ?? '').replace(/\r?\n$/, '')
		})
		if (matches.length >= maxResults) {
			return matches
		}
	}

	return matches
}

function buildRipgrepArgs(rootDirectory: string, argumentsValue: GrepArguments): string[] {
	const args = ['--json', '--line-number', '--hidden', '--glob', '!.git/**', '--glob', '!node_modules/**']
	if (!argumentsValue.caseSensitive) {
		args.push('--ignore-case')
	}
	if (!argumentsValue.regex) {
		args.push('--fixed-strings')
	}

	args.push(argumentsValue.query)
	args.push(
		argumentsValue.path?.trim() ? resolveWorkspacePath(rootDirectory, argumentsValue.path.trim()) : rootDirectory
	)

	return args
}

function normalizeRipgrepPath(rootDirectory: string, filePath: string): string {
	return filePath.startsWith(rootDirectory) ? filePath.slice(rootDirectory.length + 1).replaceAll('\\', '/') : filePath
}

function parseGrepArguments(input: unknown): GrepArguments {
	if (!isRecord(input)) {
		throw new Error('Arguments must be a JSON object.')
	}

	const query = input.query
	if (typeof query !== 'string' || !query.trim()) {
		throw new Error('query must be a non-empty string.')
	}

	const caseSensitive = parseOptionalBoolean(input.caseSensitive, 'caseSensitive')
	const path = parseOptionalPath(input.path)
	const regex = parseOptionalBoolean(input.regex, 'regex')

	return {
		caseSensitive,
		maxResults: parseOptionalPositiveInteger(input.maxResults, 'maxResults'),
		path,
		query: query.trim(),
		regex
	}
}

function parseOptionalPath(value: unknown): string | undefined {
	if (value === undefined) {
		return undefined
	}

	if (typeof value !== 'string' || !value.trim()) {
		throw new Error('path must be a non-empty string when provided.')
	}

	return value
}

function createLineMatcher(argumentsValue: GrepArguments): (line: string) => boolean {
	if (argumentsValue.regex) {
		const flags = argumentsValue.caseSensitive ? '' : 'i'
		const expression = new RegExp(argumentsValue.query, flags)
		return line => expression.test(line)
	}

	if (argumentsValue.caseSensitive) {
		return line => line.includes(argumentsValue.query)
	}

	const query = argumentsValue.query.toLowerCase()
	return line => line.toLowerCase().includes(query)
}

function selectCandidateFiles(rootDirectory: string, path?: string): string[] {
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
