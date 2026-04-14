import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import {
	getErrorMessage,
	getRequestedPath,
	isRecord,
	normalizeRelativePath,
	resolveWorkspaceFilePath,
	resolveWorkspaceRoot
} from './common'
import type { ToolExecutionContext } from './tool-types'

const MAX_WRITE_CHARACTERS = 48_000

export const WRITE_TOOL_NAME = 'write'

export const WRITE_TOOL_DEFINITION = {
	function: {
		description: 'Create or overwrite a UTF-8 text file in the current workspace.',
		name: WRITE_TOOL_NAME,
		parameters: {
			additionalProperties: false,
			properties: {
				content: { description: 'UTF-8 text to write.', type: 'string' },
				path: { description: 'Workspace-relative file path to write.', type: 'string' }
			},
			required: ['path', 'content'],
			type: 'object'
		},
		strict: true
	},
	type: 'function'
} as const

type WriteArguments = { content: string; path: string }

type WriteErrorResult = { error: string; ok: false; path?: string }

type WriteSuccessResult = { bytesWritten: number; ok: true; overwritten: boolean; path: string }

export type WriteResult = WriteErrorResult | WriteSuccessResult

export function executeWriteTool(argumentsJson: string, options: ToolExecutionContext = {}): string {
	try {
		const parsedArguments = JSON.parse(argumentsJson) as unknown
		return JSON.stringify(writeFileInWorkspace(parsedArguments, options))
	} catch (error) {
		return JSON.stringify({
			error: `Invalid write arguments: ${getErrorMessage(error)}`,
			ok: false
		} satisfies WriteErrorResult)
	}
}

export function writeFileInWorkspace(input: unknown, options: ToolExecutionContext = {}): WriteResult {
	try {
		return buildWriteSuccessResult(input, options)
	} catch (error) {
		return { error: getErrorMessage(error), ok: false, path: getRequestedPath(input) }
	}
}

function buildWriteSuccessResult(input: unknown, options: ToolExecutionContext = {}): WriteSuccessResult {
	const rootDirectory = resolveWorkspaceRoot(options.workspaceRoot)
	const argumentsValue = parseWriteArguments(input)
	const filePath = resolveWorkspaceFilePath(rootDirectory, argumentsValue.path.trim(), { allowMissing: true })
	const parentDirectory = dirname(filePath)

	mkdirSync(parentDirectory, { recursive: true })

	if (existsSync(filePath) && statSync(filePath).isDirectory()) {
		throw new Error(`Path is a directory: ${argumentsValue.path}`)
	}

	const overwritten = existsSync(filePath)
	writeFileSync(filePath, argumentsValue.content, 'utf8')

	return {
		bytesWritten: Buffer.byteLength(argumentsValue.content, 'utf8'),
		ok: true,
		overwritten,
		path: normalizeRelativePath(rootDirectory, filePath)
	}
}

function parseWriteArguments(input: unknown): WriteArguments {
	if (!isRecord(input)) {
		throw new Error('Arguments must be a JSON object.')
	}

	const path = input.path
	if (typeof path !== 'string' || !path.trim()) {
		throw new Error('path must be a non-empty string.')
	}

	const content = input.content
	if (typeof content !== 'string') {
		throw new TypeError('content must be a string.')
	}

	if (content.length > MAX_WRITE_CHARACTERS) {
		throw new Error(`content exceeds the maximum size of ${MAX_WRITE_CHARACTERS} characters.`)
	}

	return { content, path }
}
