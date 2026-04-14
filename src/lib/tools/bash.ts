import { spawnSync } from 'node:child_process'
import { statSync } from 'node:fs'

import {
	getErrorMessage,
	getRequestedPath,
	isRecord,
	normalizeRelativePath,
	parseOptionalPositiveInteger,
	resolveWorkspacePath,
	resolveWorkspaceRoot
} from './common'
import type { ToolExecutionContext } from './tool-types'

const DEFAULT_MAX_OUTPUT_CHARACTERS = 12_000
const DEFAULT_TIMEOUT_MS = 15_000
const MAX_TIMEOUT_MS = 60_000

export const BASH_TOOL_NAME = 'bash'

export const BASH_TOOL_DEFINITION = {
	function: {
		description: 'Run a bash command inside the current workspace and capture its stdout and stderr.',
		name: BASH_TOOL_NAME,
		parameters: {
			additionalProperties: false,
			properties: {
				command: { description: 'Bash command to execute.', type: 'string' },
				maxOutputCharacters: {
					description: 'Maximum combined stdout and stderr characters to return.',
					minimum: 1,
					type: 'integer'
				},
				path: { description: 'Optional workspace-relative working directory.', type: 'string' },
				timeoutMs: { description: 'Optional execution timeout in milliseconds.', minimum: 1, type: 'integer' }
			},
			required: ['command'],
			type: 'object'
		},
		strict: true
	},
	type: 'function'
} as const

type BashArguments = { command: string; maxOutputCharacters?: number; path?: string; timeoutMs?: number }
type BashErrorResult = { command?: string; error: string; ok: false; path?: string }
type BashSuccessResult = {
	command: string
	cwd: string
	exitCode: number
	ok: true
	stderr: string
	stdout: string
	timedOut: boolean
	truncated: boolean
}

export type BashResult = BashErrorResult | BashSuccessResult

export function executeBashTool(argumentsJson: string, options: ToolExecutionContext = {}): string {
	try {
		const parsedArguments = JSON.parse(argumentsJson) as unknown
		return JSON.stringify(runBashCommand(parsedArguments, options))
	} catch (error) {
		return JSON.stringify({
			error: `Invalid bash arguments: ${getErrorMessage(error)}`,
			ok: false
		} satisfies BashErrorResult)
	}
}

export function runBashCommand(input: unknown, options: ToolExecutionContext = {}): BashResult {
	try {
		const rootDirectory = resolveWorkspaceRoot(options.workspaceRoot)
		const argumentsValue = parseBashArguments(input)
		const cwd = resolveCommandDirectory(rootDirectory, argumentsValue.path)
		const timeoutMs = normalizeTimeout(argumentsValue.timeoutMs)
		const result = spawnSync('bash', ['-lc', argumentsValue.command], {
			cwd,
			encoding: 'utf8',
			maxBuffer: 1_000_000,
			timeout: timeoutMs
		})
		const maxOutputCharacters = argumentsValue.maxOutputCharacters ?? DEFAULT_MAX_OUTPUT_CHARACTERS
		const stdout = truncateText(result.stdout ?? '', maxOutputCharacters)
		const remainingCharacters = Math.max(maxOutputCharacters - stdout.length, 0)
		const stderr = truncateText(result.stderr ?? '', remainingCharacters)
		const combinedLength = (result.stdout ?? '').length + (result.stderr ?? '').length

		return {
			command: argumentsValue.command,
			cwd: normalizeRelativePath(rootDirectory, cwd) || '.',
			exitCode: result.status ?? 1,
			ok: true,
			stderr,
			stdout,
			timedOut: result.signal === 'SIGTERM',
			truncated: combinedLength > stdout.length + stderr.length
		}
	} catch (error) {
		return {
			command: getRequestedCommand(input),
			error: getErrorMessage(error),
			ok: false,
			path: getRequestedPath(input)
		}
	}
}

function getRequestedCommand(input: unknown): string | undefined {
	if (!isRecord(input)) {
		return undefined
	}

	return typeof input.command === 'string' ? input.command : undefined
}

function parseBashArguments(input: unknown): BashArguments {
	if (!isRecord(input)) {
		throw new Error('Arguments must be a JSON object.')
	}

	const command = input.command
	if (typeof command !== 'string' || !command.trim()) {
		throw new Error('command must be a non-empty string.')
	}

	const path = input.path
	if (path !== undefined && (typeof path !== 'string' || !path.trim())) {
		throw new Error('path must be a non-empty string when provided.')
	}

	return {
		command: command.trim(),
		maxOutputCharacters: parseOptionalPositiveInteger(input.maxOutputCharacters, 'maxOutputCharacters'),
		path,
		timeoutMs: parseOptionalPositiveInteger(input.timeoutMs, 'timeoutMs')
	}
}

function normalizeTimeout(timeoutMs: number | undefined): number {
	if (timeoutMs === undefined) {
		return DEFAULT_TIMEOUT_MS
	}

	return Math.min(timeoutMs, MAX_TIMEOUT_MS)
}

function resolveCommandDirectory(rootDirectory: string, path: string | undefined): string {
	if (!path?.trim()) {
		return rootDirectory
	}

	const directoryPath = resolveWorkspacePath(rootDirectory, path.trim())
	if (!statSync(directoryPath).isDirectory()) {
		throw new Error(`path must point to a directory: ${path}`)
	}

	return directoryPath
}

function truncateText(value: string, maxCharacters: number): string {
	return maxCharacters <= 0 ? '' : value.slice(0, maxCharacters)
}
