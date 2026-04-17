/* eslint-disable max-lines */

import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { realpathSync } from 'node:fs'

import type { WorkerTranscriptEntry } from '../../types'
import { encodeFramedMessage, FramedMessageReader } from '../ipc/framing'
import { decodeWorkerEnvelope, encodeWorkerEnvelope, type WorkerWireEnvelope } from '../ipc/worker-codec'
import { buildSandboxSessionBootstrap, createSandboxCommand } from './sandbox'
import type { TurnRunner, WorkerSession } from './turn-runner'
import type {
	WorkerExecutionEvent,
	WorkerSessionRequest,
	WorkerTurnCompletedEvent,
	WorkerTurnEvent,
	WorkerTurnRequest,
	WorkerToolExecutionRequest,
	WorkerToolExecutionResponse
} from './types'
import { createWorkerTranscriptState, recordWorkerTranscriptEntry } from './worker-transcript'

type SubprocessTurnRunnerOptions = { appRoot?: string; bunExecutable?: string; sandboxCommand?: string }

type PendingExecution = { reject: (error: Error) => void; resolve: (response: WorkerToolExecutionResponse) => void }

export class SubprocessTurnRunner implements TurnRunner {
	private readonly appRoot: string
	private readonly bunExecutable: string
	private readonly sandboxCommand: string

	constructor(options: SubprocessTurnRunnerOptions = {}) {
		this.appRoot = options.appRoot ?? process.cwd()
		this.bunExecutable = realpathSync(options.bunExecutable ?? process.execPath)
		this.sandboxCommand = options.sandboxCommand ?? '/usr/bin/bwrap'
	}

	startSession(
		input: WorkerSessionRequest,
		signal?: AbortSignal,
		onTranscriptEntry?: (entry: Omit<WorkerTranscriptEntry, 'id'>) => void,
		onExecutionEvent?: (event: WorkerExecutionEvent) => void
	): Promise<WorkerSession> {
		return new Promise((resolve, reject) => {
			assertSandboxRuntimeSupported(this.sandboxCommand)
			const transcriptState = createWorkerTranscriptState(input, onTranscriptEntry)
			const child = spawnWorkerProcess(this.appRoot, this.bunExecutable, this.sandboxCommand, input)
			const bootstrap = buildSandboxSessionBootstrap(input)
			const pendingExecutions = new Map<string, PendingExecution>()
			let stderr = ''
			let settled = false

			const cleanup = (): void => {
				signal?.removeEventListener('abort', abortHandler)
			}

			const rejectSession = (error: Error): void => {
				if (settled) {
					return
				}

				settled = true
				cleanup()
				reject(error)
			}

			const failPendingExecutions = (error: Error): void => {
				for (const pending of pendingExecutions.values()) {
					pending.reject(error)
				}
				pendingExecutions.clear()
			}

			const abortHandler = (): void => {
				child.kill('SIGTERM')
			}

			signal?.addEventListener('abort', abortHandler, { once: true })
			child.stderr.setEncoding('utf8')
			child.stderr.on('data', chunk => {
				stderr += chunk
			})
			child.on('error', error => {
				failPendingExecutions(error)
				rejectSession(error)
			})
			child.on('close', code => {
				const error = signal?.aborted
					? new Error('Worker session cancelled.')
					: code === 0
						? null
						: new Error(extractWorkerErrorMessage(stderr, code))
				if (error) {
					failPendingExecutions(error)
					if (!settled) {
						rejectSession(error)
					}
				}
			})

			attachWorkerMessageListeners(child, transcriptState, pendingExecutions, onExecutionEvent)

			const bootstrapEnvelope: WorkerWireEnvelope = {
				messageId: `${input.turnId}:bootstrap`,
				payload: {
					conversationId: bootstrap.conversationId,
					defaultReadRoot: bootstrap.filesystem.defaultReadRoot,
					readRoots: bootstrap.filesystem.readRoots,
					turnId: bootstrap.turnId,
					writeRoots: bootstrap.filesystem.writeRoots
				},
				type: 'sessionBootstrap'
			}
			writeWorkerEnvelope(child, transcriptState, 'sessionBootstrap', bootstrapEnvelope)

			const session: WorkerSession = {
				close: async (): Promise<void> => {
					if (child.killed || child.exitCode !== null) {
						return
					}

					const shutdownEnvelope: WorkerWireEnvelope = {
						messageId: `${input.turnId}:shutdown`,
						payload: { reason: 'turn complete' },
						type: 'shutdown'
					}
					writeWorkerEnvelope(child, transcriptState, 'shutdown', shutdownEnvelope)
					child.stdin.end()
					await new Promise<void>(resolveClose => {
						child.once('close', () => {
							cleanup()
							resolveClose()
						})
					})
				},
				executeTool: (request: WorkerToolExecutionRequest): Promise<WorkerToolExecutionResponse> => {
					return new Promise<WorkerToolExecutionResponse>((resolveExecution, rejectExecution) => {
						pendingExecutions.set(request.requestId, { reject: rejectExecution, resolve: resolveExecution })
						const envelope: WorkerWireEnvelope = {
							messageId: request.requestId,
							payload: {
								argumentsJson: request.argumentsJson,
								authorization: request.authorization,
								requestId: request.requestId,
								toolName: request.toolName
							},
							type: 'executeToolRequest'
						}
						try {
							writeWorkerEnvelope(child, transcriptState, 'executeToolRequest', envelope)
						} catch (error) {
							pendingExecutions.delete(request.requestId)
							rejectExecution(error instanceof Error ? error : new Error('Failed to send worker tool request.'))
						}
					})
				}
			}

			settled = true
			resolve(session)
		})
	}

	runTurn(
		_input: WorkerTurnRequest,
		_onEvent: (event: WorkerTurnEvent) => void,
		_signal?: AbortSignal,
		_onToolAuthorizationRequest?: unknown,
		_onHostToolRequest?: unknown,
		_onTranscriptEntry?: (entry: Omit<WorkerTranscriptEntry, 'id'>) => void
	): Promise<WorkerTurnCompletedEvent> {
		return Promise.reject(new Error('runTurn is no longer supported. Use daemon-owned inference with startSession().'))
	}
}

function attachWorkerMessageListeners(
	child: ChildProcessWithoutNullStreams,
	transcriptState: ReturnType<typeof createWorkerTranscriptState>,
	pendingExecutions: Map<string, PendingExecution>,
	onExecutionEvent?: (event: WorkerExecutionEvent) => void
): void {
	const reader = new FramedMessageReader()
	child.stdout.on('data', chunk => {
		reader.push(chunk as Buffer, payload => {
			const envelope = decodeWorkerEnvelope(payload)
			recordWorkerTranscriptEntry(
				transcriptState,
				'workerToDaemon',
				toTranscriptKind(envelope.type),
				serializeEnvelope(envelope)
			)
			if (envelope.type === 'executionEvent') {
				onExecutionEvent?.(envelope.payload)
				return
			}

			if (envelope.type === 'executionError') {
				const pending = pendingExecutions.get(envelope.payload.requestId)
				if (!pending) {
					return
				}

				pendingExecutions.delete(envelope.payload.requestId)
				pending.reject(new Error(envelope.payload.error))
				return
			}

			if (envelope.type !== 'executeToolResponse') {
				return
			}

			const pending = pendingExecutions.get(envelope.payload.requestId)
			if (!pending) {
				return
			}

			pendingExecutions.delete(envelope.payload.requestId)
			pending.resolve(envelope.payload)
		})
	})
}

function spawnWorkerProcess(
	appRoot: string,
	bunExecutable: string,
	sandboxCommand: string,
	request: WorkerSessionRequest
): ChildProcessWithoutNullStreams {
	const sandboxCommandSpec = createSandboxCommand(appRoot, bunExecutable, sandboxCommand, request)
	return spawn(sandboxCommandSpec.command, sandboxCommandSpec.args, {
		cwd: appRoot,
		env: sandboxCommandSpec.env,
		stdio: ['pipe', 'pipe', 'pipe']
	})
}

function writeWorkerEnvelope(
	child: ChildProcessWithoutNullStreams,
	transcriptState: ReturnType<typeof createWorkerTranscriptState>,
	kind: WorkerTranscriptEntry['kind'],
	envelope: WorkerWireEnvelope
): void {
	recordWorkerTranscriptEntry(transcriptState, 'daemonToWorker', kind, serializeEnvelope(envelope))
	child.stdin.write(encodeFramedMessage(encodeWorkerEnvelope(envelope)))
}

function serializeEnvelope(envelope: WorkerWireEnvelope): string {
	return JSON.stringify(envelope)
}

function toTranscriptKind(type: WorkerWireEnvelope['type']): WorkerTranscriptEntry['kind'] {
	switch (type) {
		case 'sessionBootstrap':
			return 'sessionBootstrap'
		case 'executeToolRequest':
			return 'executeToolRequest'
		case 'executeToolResponse':
			return 'executeToolResponse'
		case 'executionEvent':
			return 'executionEvent'
		case 'executionError':
			return 'executionError'
		case 'shutdown':
			return 'shutdown'
	}
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

function assertSandboxRuntimeSupported(sandboxCommand: string): void {
	if (process.platform !== 'linux') {
		throw new Error('Sandboxed worker execution requires Linux support.')
	}

	assertCommandAvailable(sandboxCommand, 'bubblewrap')
}

function assertCommandAvailable(command: string, label: string): void {
	const result = spawnSync(command, ['--version'], { encoding: 'utf8' })
	if (!result.error) {
		return
	}

	if ((result.error as NodeJS.ErrnoException).code === 'ENOENT') {
		throw new Error(`Sandboxed worker execution requires ${label} to be installed.`)
	}

	throw new Error(`Sandboxed worker execution could not verify ${label}: ${result.error.message}`)
}
