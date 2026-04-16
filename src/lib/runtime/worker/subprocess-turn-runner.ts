/* eslint-disable max-lines */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { WorkerTranscriptEntry } from '../../types'
import { buildSandboxTurnInput, createSandboxCommand } from './sandbox'
import type { TurnRunner } from './turn-runner'
import type {
	WorkerHostToolRequest,
	WorkerHostToolResponse,
	WorkerStdoutMessage,
	WorkerToolAuthorizationRequest,
	WorkerToolAuthorizationResponse,
	WorkerTurnCompletedEvent,
	WorkerTurnEvent,
	WorkerTurnRequest
} from './types'
import {
	createWorkerTranscriptState,
	recordWorkerTranscriptEntry,
	type WorkerTranscriptState
} from './worker-transcript'

type SubprocessTurnRunnerOptions = { appRoot?: string; bunExecutable?: string; sandboxCommand?: string }

export class SubprocessTurnRunner implements TurnRunner {
	private readonly appRoot: string
	private readonly bunExecutable: string
	private readonly sandboxCommand: string

	constructor(options: SubprocessTurnRunnerOptions = {}) {
		this.appRoot = options.appRoot ?? process.cwd()
		this.bunExecutable = realpathSync(options.bunExecutable ?? process.execPath)
		this.sandboxCommand = options.sandboxCommand ?? 'bwrap'
	}

	runTurn(
		input: WorkerTurnRequest,
		onEvent: (event: WorkerTurnEvent) => void,
		signal?: AbortSignal,
		onToolAuthorizationRequest?: (request: WorkerToolAuthorizationRequest) => Promise<WorkerToolAuthorizationResponse>,
		onHostToolRequest?: (request: WorkerHostToolRequest) => Promise<WorkerHostToolResponse>,
		onTranscriptEntry?: (entry: Omit<WorkerTranscriptEntry, 'id'>) => void
	): Promise<WorkerTurnCompletedEvent> {
		return new Promise((resolve, reject) => {
			const hostTurnInputDir = mkdtempSync(join(tmpdir(), 'kestrion-turn-'))
			const hostTurnInputFile = join(hostTurnInputDir, 'input.json')
			const hostResponseDir = join(hostTurnInputDir, 'host-responses')
			const cleanup = (): void => {
				rmSync(hostTurnInputDir, { force: true, recursive: true })
			}
			mkdirSync(hostResponseDir, { recursive: true })
			const serializedTurnInput = JSON.stringify(buildSandboxTurnInput(input))
			writeFileSync(hostTurnInputFile, serializedTurnInput)
			const transcriptState = createWorkerTranscriptState(input, onTranscriptEntry)
			recordWorkerTranscriptEntry(transcriptState, 'daemonToWorker', 'turnInput', serializedTurnInput)

			const child = spawnWorkerProcess(this.sandboxCommand, this.appRoot, this.bunExecutable, input, hostTurnInputDir)
			const workerState = createWorkerState()
			const abortHandler = (): void => {
				child.kill('SIGTERM')
			}

			signal?.addEventListener('abort', abortHandler, { once: true })
			attachWorkerOutputListeners(
				child,
				workerState,
				onEvent,
				hostResponseDir,
				transcriptState,
				onToolAuthorizationRequest,
				onHostToolRequest
			)
			attachWorkerLifecycleListeners(child, workerState, signal, abortHandler, cleanup, resolve, reject)
			child.stdin.end()
		})
	}
}

function spawnWorkerProcess(
	sandboxCommand: string,
	appRoot: string,
	bunExecutable: string,
	request: WorkerTurnRequest,
	hostTurnInputDir: string
): ChildProcessWithoutNullStreams {
	const sandboxCommandSpec = createSandboxCommand(appRoot, bunExecutable, request, hostTurnInputDir)
	return spawn(sandboxCommand, sandboxCommandSpec.args, {
		cwd: appRoot,
		env: sandboxCommandSpec.env,
		stdio: ['pipe', 'pipe', 'pipe']
	})
}

function createWorkerState(): {
	completedEvent: WorkerTurnCompletedEvent | null
	stderr: string
	stdoutBuffer: string
} {
	return { completedEvent: null, stderr: '', stdoutBuffer: '' }
}

function attachWorkerOutputListeners(
	child: ChildProcessWithoutNullStreams,
	state: ReturnType<typeof createWorkerState>,
	onEvent: (event: WorkerTurnEvent) => void,
	hostResponseDir: string,
	transcriptState: WorkerTranscriptState,
	onToolAuthorizationRequest?: (request: WorkerToolAuthorizationRequest) => Promise<WorkerToolAuthorizationResponse>,
	onHostToolRequest?: (request: WorkerHostToolRequest) => Promise<WorkerHostToolResponse>
): void {
	child.stdout.setEncoding('utf8')
	child.stdout.on('data', chunk => {
		state.stdoutBuffer += chunk
		for (const { line, message } of drainWorkerMessages(state)) {
			if (message.type === 'event') {
				recordWorkerTranscriptEntry(transcriptState, 'workerToDaemon', 'workerEvent', line)
				if (message.event.type === 'completed') {
					state.completedEvent = message.event
					if (!child.stdin.destroyed && child.stdin.writable) {
						child.stdin.end()
					}
				}
				onEvent(message.event)
				continue
			}

			if (message.type === 'hostToolRequest') {
				recordWorkerTranscriptEntry(transcriptState, 'workerToDaemon', 'hostToolRequest', line)
				void respondToWorkerHostRequest(hostResponseDir, transcriptState, message, onHostToolRequest)
				continue
			}

			recordWorkerTranscriptEntry(transcriptState, 'workerToDaemon', 'toolAuthorizationRequest', line)
			void respondToWorkerAuthorizationRequest(hostResponseDir, transcriptState, message, onToolAuthorizationRequest)
		}
	})
	child.stderr.setEncoding('utf8')
	child.stderr.on('data', chunk => {
		state.stderr += chunk
	})
}

function attachWorkerLifecycleListeners(
	child: ChildProcessWithoutNullStreams,
	state: ReturnType<typeof createWorkerState>,
	signal: AbortSignal | undefined,
	abortHandler: () => void,
	cleanup: () => void,
	resolve: (event: WorkerTurnCompletedEvent) => void,
	reject: (error: Error) => void
): void {
	child.on('error', error => {
		signal?.removeEventListener('abort', abortHandler)
		cleanup()
		reject(error)
	})
	child.on('close', code => {
		signal?.removeEventListener('abort', abortHandler)
		cleanup()
		finishWorkerProcess(code, signal, state, resolve, reject)
	})
}

function drainWorkerMessages(
	state: ReturnType<typeof createWorkerState>
): Array<{ line: string; message: WorkerStdoutMessage }> {
	const messages: Array<{ line: string; message: WorkerStdoutMessage }> = []
	let newlineIndex = state.stdoutBuffer.indexOf('\n')
	while (newlineIndex >= 0) {
		const line = state.stdoutBuffer.slice(0, newlineIndex).trim()
		state.stdoutBuffer = state.stdoutBuffer.slice(newlineIndex + 1)
		if (line) {
			messages.push({ line, message: JSON.parse(line) as WorkerStdoutMessage })
		}

		newlineIndex = state.stdoutBuffer.indexOf('\n')
	}

	return messages
}

function finishWorkerProcess(
	code: number | null,
	signal: AbortSignal | undefined,
	state: ReturnType<typeof createWorkerState>,
	resolve: (event: WorkerTurnCompletedEvent) => void,
	reject: (error: Error) => void
): void {
	if (signal?.aborted) {
		reject(new Error('Agent turn cancelled.'))
		return
	}

	if (code !== 0) {
		reject(new Error(extractWorkerErrorMessage(state.stderr, code)))
		return
	}

	if (!state.completedEvent) {
		reject(new Error('Worker process exited without a completion event.'))
		return
	}

	resolve(state.completedEvent)
}

function extractWorkerErrorMessage(stderr: string, code: number | null): string {
	const trimmed = stderr.trim()
	if (!trimmed) {
		return `Worker process exited with status ${code}.`
	}

	const stderrLines = trimmed
		.split(/\r?\n/)
		.map(line => line.trim())
		.filter(Boolean)
	const explicitErrorLine = stderrLines.find(line => /^error:\s+/i.test(line))
	if (explicitErrorLine) {
		return explicitErrorLine.replace(/^error:\s+/i, '')
	}

	return stderrLines[0] ?? `Worker process exited with status ${code}.`
}

async function respondToWorkerHostRequest(
	hostResponseDir: string,
	transcriptState: WorkerTranscriptState,
	request: WorkerHostToolRequest,
	onHostToolRequest?: (request: WorkerHostToolRequest) => Promise<WorkerHostToolResponse>
): Promise<void> {
	const response = await resolveWorkerHostToolResponse(request, onHostToolRequest)
	const serializedResponse = JSON.stringify(response)
	recordWorkerTranscriptEntry(
		transcriptState,
		'daemonToWorker',
		response.type === 'hostToolError' ? 'hostToolError' : 'hostToolResponse',
		serializedResponse
	)
	writeFileSync(join(hostResponseDir, `${request.requestId}.json`), serializedResponse)
}

async function respondToWorkerAuthorizationRequest(
	hostResponseDir: string,
	transcriptState: WorkerTranscriptState,
	request: WorkerToolAuthorizationRequest,
	onToolAuthorizationRequest?: (request: WorkerToolAuthorizationRequest) => Promise<WorkerToolAuthorizationResponse>
): Promise<void> {
	const response = await resolveWorkerToolAuthorizationResponse(request, onToolAuthorizationRequest)
	const serializedResponse = JSON.stringify(response)
	recordWorkerTranscriptEntry(
		transcriptState,
		'daemonToWorker',
		response.type === 'toolAuthorizationDeny' ? 'toolAuthorizationDeny' : 'toolAuthorizationAllow',
		serializedResponse
	)
	writeFileSync(join(hostResponseDir, `${request.requestId}.json`), serializedResponse)
}

async function resolveWorkerHostToolResponse(
	request: WorkerHostToolRequest,
	onHostToolRequest?: (request: WorkerHostToolRequest) => Promise<WorkerHostToolResponse>
): Promise<WorkerHostToolResponse> {
	if (!onHostToolRequest) {
		return {
			error: `Tool "${request.toolName}" is not available in this daemon context.`,
			requestId: request.requestId,
			type: 'hostToolError'
		}
	}

	try {
		return await onHostToolRequest(request)
	} catch (error) {
		return {
			error: error instanceof Error ? error.message : 'Unknown host tool error.',
			requestId: request.requestId,
			type: 'hostToolError'
		}
	}
}

async function resolveWorkerToolAuthorizationResponse(
	request: WorkerToolAuthorizationRequest,
	onToolAuthorizationRequest?: (request: WorkerToolAuthorizationRequest) => Promise<WorkerToolAuthorizationResponse>
): Promise<WorkerToolAuthorizationResponse> {
	if (!onToolAuthorizationRequest) {
		return {
			error: `Tool "${request.toolName}" could not be authorized because the daemon bridge is unavailable.`,
			requestId: request.requestId,
			type: 'toolAuthorizationDeny'
		}
	}

	try {
		return await onToolAuthorizationRequest(request)
	} catch (error) {
		return {
			error: error instanceof Error ? error.message : 'Unknown tool authorization error.',
			requestId: request.requestId,
			type: 'toolAuthorizationDeny'
		}
	}
}
