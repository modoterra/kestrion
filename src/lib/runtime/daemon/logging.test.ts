import { afterEach, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
	clearMockFireworksScenarioResponses,
	mockFireworksScenarioResponses
} from '../../../test/mock-fireworks-scenarios'
import { clearMockFireworksTextResponses, mockFireworksTextResponses } from '../../../test/mock-fireworks-text-responses'
import { createRenderAppContext } from '../../../test/render-app-context'
import { AgentService } from '../../services/agent-service'
import type { TurnRunner, WorkerSession } from '../worker/turn-runner'
import type {
	WorkerExecutionEvent,
	WorkerSessionRequest,
	WorkerToolExecutionRequest,
	WorkerToolExecutionResponse
} from '../worker/types'
import type { WorkerTranscriptEntry, WorkerTranscriptKind } from '../../types'
import { DaemonController } from './controller'
import { createDaemonLogger } from './logger'

const cleanupPaths: string[] = []

afterEach(() => {
	clearMockFireworksScenarioResponses()
	clearMockFireworksTextResponses()

	for (const path of cleanupPaths.splice(0).toReversed()) {
		rmSync(path, { force: true, recursive: true })
	}
})

test('writes compact request and compaction planning details to the daemon log', async () => {
	mockFireworksScenarioResponses([
		{
			body: {
				choices: [{ message: { content: 'Checkpoint summary recorded in the daemon log.' } }],
				id: 'chatcmpl_daemon_logging_compact',
				model: 'accounts/fireworks/models/kimi-k2p5'
			},
			kind: 'json'
		}
	])

	const homeDir = mkdtempSync(join(tmpdir(), 'kestrion-daemon-logging-compact-'))
	cleanupPaths.push(homeDir)

	const { config, paths, store } = createRenderAppContext(homeDir, { providerConfigured: true })
	const logger = createDaemonLogger(paths.daemonLogFile).child('test')
	const service = new AgentService(store, config, logger.child('agent_service'))
	const controller = new DaemonController(store, service, paths, createLoggingTurnRunner(), config, logger.child('controller'))

	try {
		const thread = createThreadWithTurns(service, store, 5)
		await controller.compactConversation(thread.conversation.id)

		const daemonLog = readFileSync(paths.daemonLogFile, 'utf8')
		expect(daemonLog).toContain('"event":"conversation.compact.forward"')
		expect(daemonLog).toContain('"event":"conversation.compact.plan"')
		expect(daemonLog).toContain('"event":"conversation.compact.saved"')
	} finally {
		store.close()
	}
})

test('writes turn lifecycle events to the daemon log during assistant replies', async () => {
	mockFireworksTextResponses(['Hello from daemon logging.'])

	const homeDir = mkdtempSync(join(tmpdir(), 'kestrion-daemon-logging-turn-'))
	cleanupPaths.push(homeDir)

	const { config, paths, store } = createRenderAppContext(homeDir, { providerConfigured: true })
	const logger = createDaemonLogger(paths.daemonLogFile).child('test')
	const service = new AgentService(store, config, logger.child('agent_service'))
	const controller = new DaemonController(store, service, paths, createLoggingTurnRunner(), config, logger.child('controller'))

	try {
		const thread = await controller.addUserMessage('draft', 'Write something to the log.')
		await controller.generateAssistantReply(thread.conversation.id, () => {})
	} finally {
		store.close()
	}

	const daemonLog = readFileSync(paths.daemonLogFile, 'utf8')
	expect(daemonLog).toContain('"event":"turn.started"')
	expect(daemonLog).toContain('"event":"turn.event"')
	expect(daemonLog).toContain('"event":"turn.completed"')
})

function createLoggingTurnRunner(): TurnRunner {
	return {
		async startSession(
			input: WorkerSessionRequest,
			_signal?: AbortSignal,
			onTranscriptEntry?: (entry: Omit<WorkerTranscriptEntry, 'id'>) => void,
			_onExecutionEvent?: (event: WorkerExecutionEvent) => void
		): Promise<WorkerSession> {
			let sequence = 0
			const recordTranscript = (
				direction: 'daemonToWorker' | 'workerToDaemon',
				kind: WorkerTranscriptKind,
				payload: unknown
			): void => {
				onTranscriptEntry?.({
					conversationId: input.conversation.id,
					createdAt: new Date().toISOString(),
					direction,
					kind,
					payloadJson: JSON.stringify(payload),
					sequence: sequence++,
					turnId: input.turnId
				})
			}

			recordTranscript('daemonToWorker', 'sessionBootstrap', {
				conversationId: input.conversation.id,
				turnId: input.turnId
			})

			return {
				close: async (): Promise<void> => {
					recordTranscript('daemonToWorker', 'shutdown', { reason: 'turn complete' })
				},
				executeTool: async (_request: WorkerToolExecutionRequest): Promise<WorkerToolExecutionResponse> => {
					throw new Error('executeTool should not be used in daemon logging tests.')
				}
			}
		}
	}
}

function createThreadWithTurns(
	service: ReturnType<typeof createRenderAppContext>['agentService'],
	store: ReturnType<typeof createRenderAppContext>['store'],
	turnCount: number
) {
	let thread = service.createDraftConversation()

	for (let index = 0; index < turnCount; index += 1) {
		thread = service.addUserMessage(thread.conversation.id, `Turn ${index + 1} request`)
		store.appendMessage({
			content: `Turn ${index + 1} reply`,
			conversationId: thread.conversation.id,
			model: thread.conversation.model,
			provider: thread.conversation.provider,
			role: 'assistant'
		})
		thread = service.loadConversation(thread.conversation.id)
	}

	return thread
}
