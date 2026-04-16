import { writeFileSync } from 'node:fs'

import {
	formatToolPath,
	getErrorMessage,
	getRequestedPath,
	isRecord,
	readWorkspaceTextFile,
	resolveToolFilePath
} from './common'
import type { ToolExecutionContext } from './tool-types'

const MAX_EDIT_CHARACTERS = 48_000

export const EDIT_TOOL_NAME = 'edit'

export const EDIT_TOOL_DEFINITION = {
	function: {
		description: 'Edit an existing workspace file by replacing exact text.',
		name: EDIT_TOOL_NAME,
		parameters: {
			additionalProperties: false,
			properties: {
				newText: { description: 'Replacement text.', type: 'string' },
				oldText: { description: 'Exact text to replace.', type: 'string' },
				path: { description: 'Workspace-relative file path to edit.', type: 'string' },
				replaceAll: {
					description: 'Replace every occurrence instead of requiring a single unique match.',
					type: 'boolean'
				}
			},
			required: ['path', 'oldText', 'newText'],
			type: 'object'
		},
		strict: true
	},
	type: 'function'
} as const

type EditArguments = { newText: string; oldText: string; path: string; replaceAll?: boolean }
type EditErrorResult = { error: string; ok: false; path?: string }
type EditSuccessResult = { bytesWritten: number; ok: true; path: string; replacements: number }

export type EditResult = EditErrorResult | EditSuccessResult

export function executeEditTool(argumentsJson: string, options: ToolExecutionContext = {}): string {
	try {
		const parsedArguments = JSON.parse(argumentsJson) as unknown
		return JSON.stringify(editWorkspaceFile(parsedArguments, options))
	} catch (error) {
		return JSON.stringify({
			error: `Invalid edit arguments: ${getErrorMessage(error)}`,
			ok: false
		} satisfies EditErrorResult)
	}
}

export function editWorkspaceFile(input: unknown, options: ToolExecutionContext = {}): EditResult {
	try {
		const argumentsValue = parseEditArguments(input)
		const filePath = resolveToolFilePath(options, argumentsValue.path.trim(), { write: true })
		const currentContent = readWorkspaceTextFile(filePath)
		const occurrences = countOccurrences(currentContent, argumentsValue.oldText)

		if (occurrences < 1) {
			throw new Error('oldText was not found in the file.')
		}

		if (!argumentsValue.replaceAll && occurrences > 1) {
			throw new Error('oldText matched multiple locations. Set replaceAll to true or provide a more specific match.')
		}

		const nextContent = argumentsValue.replaceAll
			? currentContent.split(argumentsValue.oldText).join(argumentsValue.newText)
			: replaceFirstOccurrence(currentContent, argumentsValue.oldText, argumentsValue.newText)

		writeFileSync(filePath, nextContent, 'utf8')
		options.onMutation?.({
			operation: 'write',
			path: filePath,
			sizeBytes: Buffer.byteLength(nextContent, 'utf8'),
			toolName: EDIT_TOOL_NAME
		})

		return {
			bytesWritten: Buffer.byteLength(nextContent, 'utf8'),
			ok: true,
			path: formatToolPath(options, filePath),
			replacements: argumentsValue.replaceAll ? occurrences : 1
		}
	} catch (error) {
		return { error: getErrorMessage(error), ok: false, path: getRequestedPath(input) }
	}
}

function parseEditArguments(input: unknown): EditArguments {
	if (!isRecord(input)) {
		throw new Error('Arguments must be a JSON object.')
	}

	const path = input.path
	if (typeof path !== 'string' || !path.trim()) {
		throw new Error('path must be a non-empty string.')
	}

	const oldText = input.oldText
	if (typeof oldText !== 'string' || oldText.length === 0) {
		throw new Error('oldText must be a non-empty string.')
	}

	const newText = input.newText
	if (typeof newText !== 'string') {
		throw new TypeError('newText must be a string.')
	}

	if (newText.length > MAX_EDIT_CHARACTERS) {
		throw new Error(`newText exceeds the maximum size of ${MAX_EDIT_CHARACTERS} characters.`)
	}

	const replaceAll = input.replaceAll
	if (replaceAll !== undefined && typeof replaceAll !== 'boolean') {
		throw new Error('replaceAll must be a boolean when provided.')
	}

	return { newText, oldText, path, replaceAll }
}

function countOccurrences(content: string, search: string): number {
	let count = 0
	let offset = 0

	while (offset <= content.length) {
		const index = content.indexOf(search, offset)
		if (index < 0) {
			return count
		}

		count += 1
		offset = index + search.length
	}

	return count
}

function replaceFirstOccurrence(content: string, search: string, replacement: string): string {
	const index = content.indexOf(search)
	if (index < 0) {
		return content
	}

	return `${content.slice(0, index)}${replacement}${content.slice(index + search.length)}`
}
