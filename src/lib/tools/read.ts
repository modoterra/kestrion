import {
	getErrorMessage,
	getRequestedPath,
	isRecord,
	normalizeRelativePath,
	parseOptionalPositiveInteger,
	readWorkspaceTextFile,
	resolveWorkspaceFilePath,
	resolveWorkspaceRoot,
	splitLines
} from './common'
import type { ToolExecutionContext } from './tool-types'

const DEFAULT_MAX_LINES = 200
const MAX_CONTENT_CHARACTERS = 24_000

export const READ_TOOL_NAME = 'read'

export const READ_TOOL_DEFINITION = {
	function: {
		description: 'Read a UTF-8 text file from the current workspace. Use startLine and endLine to limit large reads.',
		name: READ_TOOL_NAME,
		parameters: {
			additionalProperties: false,
			properties: {
				endLine: { description: 'Optional 1-based ending line number to read.', minimum: 1, type: 'integer' },
				path: { description: 'Workspace-relative file path to read.', type: 'string' },
				startLine: { description: 'Optional 1-based starting line number to read.', minimum: 1, type: 'integer' }
			},
			required: ['path'],
			type: 'object'
		},
		strict: true
	},
	type: 'function'
} as const

type ReadArguments = { endLine?: number; path: string; startLine?: number }

type ReadErrorResult = { error: string; ok: false; path?: string }

type ReadSuccessResult = {
	content: string
	endLine: number
	ok: true
	path: string
	startLine: number
	totalLines: number
	truncated: boolean
}

export type ReadResult = ReadErrorResult | ReadSuccessResult

export function executeReadTool(argumentsJson: string, options: ToolExecutionContext = {}): string {
	try {
		const parsedArguments = JSON.parse(argumentsJson) as unknown
		return JSON.stringify(readFileFromWorkspace(parsedArguments, options))
	} catch (error) {
		return JSON.stringify({
			error: `Invalid read arguments: ${getErrorMessage(error)}`,
			ok: false
		} satisfies ReadErrorResult)
	}
}

export function readFileFromWorkspace(input: unknown, options: ToolExecutionContext = {}): ReadResult {
	try {
		return buildReadSuccessResult(input, options)
	} catch (error) {
		return { error: getErrorMessage(error), ok: false, path: getRequestedPath(input) }
	}
}

function buildReadSuccessResult(input: unknown, options: ToolExecutionContext = {}): ReadSuccessResult {
	const rootDirectory = resolveWorkspaceRoot(options.workspaceRoot)
	const argumentsValue = parseReadArguments(input)
	const filePath = resolveWorkspaceFilePath(rootDirectory, argumentsValue.path.trim())
	const lines = splitLines(readWorkspaceTextFile(filePath))
	const totalLines = lines.length
	const normalizedPath = normalizeRelativePath(rootDirectory, filePath)

	if (totalLines === 0) {
		return { content: '', endLine: 0, ok: true, path: normalizedPath, startLine: 1, totalLines, truncated: false }
	}

	return buildNonEmptyReadResult(argumentsValue, lines, normalizedPath)
}

function buildNonEmptyReadResult(argumentsValue: ReadArguments, lines: string[], path: string): ReadSuccessResult {
	const totalLines = lines.length
	const startLine = argumentsValue.startLine ?? 1
	if (startLine > totalLines) {
		throw new Error(`startLine ${startLine} exceeds the file length of ${totalLines} lines.`)
	}

	const requestedEndLine = argumentsValue.endLine ?? totalLines
	if (requestedEndLine < startLine) {
		throw new Error('endLine must be greater than or equal to startLine.')
	}

	const boundedEndLine = Math.min(requestedEndLine, startLine + DEFAULT_MAX_LINES - 1, totalLines)
	const selectedContent = lines.slice(startLine - 1, boundedEndLine).join('\n')
	const truncatedByRange =
		boundedEndLine < requestedEndLine || (argumentsValue.endLine === undefined && boundedEndLine < totalLines)
	const contentResult = trimReadContent(selectedContent, truncatedByRange)

	return {
		content: contentResult.content,
		endLine: boundedEndLine,
		ok: true,
		path,
		startLine,
		totalLines,
		truncated: contentResult.truncated
	}
}

function parseReadArguments(input: unknown): ReadArguments {
	if (!isRecord(input)) {
		throw new Error('Arguments must be a JSON object.')
	}

	const path = input.path
	if (typeof path !== 'string' || !path.trim()) {
		throw new Error('path must be a non-empty string.')
	}

	return {
		endLine: parseOptionalPositiveInteger(input.endLine, 'endLine'),
		path,
		startLine: parseOptionalPositiveInteger(input.startLine, 'startLine')
	}
}

function trimReadContent(content: string, truncated: boolean): { content: string; truncated: boolean } {
	if (content.length <= MAX_CONTENT_CHARACTERS) {
		return { content, truncated }
	}

	return { content: content.slice(0, MAX_CONTENT_CHARACTERS), truncated: true }
}
