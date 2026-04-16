import { writeFileSync } from 'node:fs'

import {
	formatToolPath,
	getErrorMessage,
	getRequestedPath,
	isRecord,
	readWorkspaceTextFile,
	resolveToolFilePath,
	splitLines
} from './common'
import type { ToolExecutionContext } from './tool-types'

const MAX_PATCH_CHARACTERS = 48_000

export const PATCH_TOOL_NAME = 'patch'

export const PATCH_TOOL_DEFINITION = {
	function: {
		description: 'Patch an existing workspace file by replacing one or more inclusive line ranges.',
		name: PATCH_TOOL_NAME,
		parameters: {
			additionalProperties: false,
			properties: {
				path: { description: 'Workspace-relative file path to patch.', type: 'string' },
				patches: {
					description: 'Line-range replacements to apply.',
					items: {
						properties: {
							content: { description: 'Replacement text for the selected line range.', type: 'string' },
							endLine: { description: 'Inclusive ending line number to replace.', minimum: 1, type: 'integer' },
							startLine: { description: 'Inclusive starting line number to replace.', minimum: 1, type: 'integer' }
						},
						required: ['startLine', 'endLine', 'content'],
						type: 'object'
					},
					type: 'array'
				}
			},
			required: ['path', 'patches'],
			type: 'object'
		},
		strict: true
	},
	type: 'function'
} as const

type FilePatch = { content: string; endLine: number; startLine: number }
type PatchArguments = { path: string; patches: FilePatch[] }
type PatchErrorResult = { error: string; ok: false; path?: string }
type PatchSuccessResult = { lineCount: number; ok: true; patchesApplied: number; path: string }

export type PatchResult = PatchErrorResult | PatchSuccessResult

export function executePatchTool(argumentsJson: string, options: ToolExecutionContext = {}): string {
	try {
		const parsedArguments = JSON.parse(argumentsJson) as unknown
		return JSON.stringify(patchWorkspaceFile(parsedArguments, options))
	} catch (error) {
		return JSON.stringify({
			error: `Invalid patch arguments: ${getErrorMessage(error)}`,
			ok: false
		} satisfies PatchErrorResult)
	}
}

export function patchWorkspaceFile(input: unknown, options: ToolExecutionContext = {}): PatchResult {
	try {
		const argumentsValue = parsePatchArguments(input)
		const filePath = resolveToolFilePath(options, argumentsValue.path.trim(), { write: true })
		const originalContent = readWorkspaceTextFile(filePath)
		const hadTrailingNewline = originalContent.endsWith('\n')
		const lines = splitLines(originalContent)
		const orderedPatches = argumentsValue.patches.toSorted((left, right) => right.startLine - left.startLine)

		assertPatchRanges(orderedPatches, lines.length)

		for (const patch of orderedPatches) {
			const replacementLines = splitLines(patch.content)
			lines.splice(patch.startLine - 1, patch.endLine - patch.startLine + 1, ...replacementLines)
		}

		const nextContent = lines.join('\n')
		writeFileSync(filePath, hadTrailingNewline && nextContent ? `${nextContent}\n` : nextContent, 'utf8')
		options.onMutation?.({
			operation: 'write',
			path: filePath,
			sizeBytes: Buffer.byteLength(nextContent, 'utf8'),
			toolName: PATCH_TOOL_NAME
		})

		return {
			lineCount: lines.length,
			ok: true,
			patchesApplied: argumentsValue.patches.length,
			path: formatToolPath(options, filePath)
		}
	} catch (error) {
		return { error: getErrorMessage(error), ok: false, path: getRequestedPath(input) }
	}
}

function parsePatchArguments(input: unknown): PatchArguments {
	if (!isRecord(input)) {
		throw new Error('Arguments must be a JSON object.')
	}

	const path = input.path
	if (typeof path !== 'string' || !path.trim()) {
		throw new Error('path must be a non-empty string.')
	}

	const patches = input.patches
	if (!Array.isArray(patches) || patches.length === 0) {
		throw new Error('patches must be a non-empty array.')
	}

	return { path, patches: patches.map((patch, index) => parseFilePatch(patch, index)) }
}

function parseFilePatch(value: unknown, index: number): FilePatch {
	if (!isRecord(value)) {
		throw new Error(`patches[${index}] must be an object.`)
	}

	const startLine = value.startLine
	const endLine = value.endLine
	if (typeof startLine !== 'number' || !Number.isInteger(startLine) || startLine < 1) {
		throw new Error(`patches[${index}].startLine must be a positive integer.`)
	}
	if (typeof endLine !== 'number' || !Number.isInteger(endLine) || endLine < startLine) {
		throw new Error(`patches[${index}].endLine must be an integer greater than or equal to startLine.`)
	}

	const content = value.content
	if (typeof content !== 'string') {
		throw new TypeError(`patches[${index}].content must be a string.`)
	}
	if (content.length > MAX_PATCH_CHARACTERS) {
		throw new Error(`patches[${index}].content exceeds the maximum size of ${MAX_PATCH_CHARACTERS} characters.`)
	}

	return { content, endLine, startLine }
}

function assertPatchRanges(patches: FilePatch[], totalLines: number): void {
	let previousStartLine = totalLines + 1

	for (const patch of patches) {
		if (patch.endLine > totalLines) {
			throw new Error(`Patch range ${patch.startLine}-${patch.endLine} is outside the file.`)
		}
		if (patch.endLine >= previousStartLine) {
			throw new Error('Patch line ranges must not overlap.')
		}

		previousStartLine = patch.startLine
	}
}
