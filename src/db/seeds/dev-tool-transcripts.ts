import type { SeedWorkerTranscriptEntry } from './types'

type SeedTranscriptTurnEntry = {
	direction: SeedWorkerTranscriptEntry['direction']
	kind: SeedWorkerTranscriptEntry['kind']
	payload: unknown
}

export const DEV_TOOL_HEAVY_WORKER_TRANSCRIPT = [
	...createTranscriptTurn('dev-tools-1', [
		{
			direction: 'daemonToWorker',
			kind: 'turnInput',
			payload: {
				conversationTitle: 'Show me something tool-heavy.',
				messages: ['Show me something tool-heavy.'],
				turnId: 'dev-tools-1'
			}
		},
		{
			direction: 'workerToDaemon',
			kind: 'workerEvent',
			payload: {
				event: {
					toolCalls: [
						{
							argumentsJson: JSON.stringify({ path: '/agent/src/lib/runtime/daemon/controller.ts' }),
							id: 'seed-tool-read',
							name: 'read'
						},
						{
							argumentsJson: JSON.stringify({
								pattern: 'toolCallsStart',
								path: '/agent/src/lib/runtime/daemon/controller.ts'
							}),
							id: 'seed-tool-grep',
							name: 'grep'
						}
					],
					type: 'toolCallsStart'
				},
				type: 'event'
			}
		},
		{
			direction: 'workerToDaemon',
			kind: 'workerEvent',
			payload: {
				event: {
					toolCalls: [
						{
							argumentsJson: JSON.stringify({ path: '/agent/src/lib/runtime/daemon/controller.ts' }),
							id: 'seed-tool-read',
							name: 'read'
						},
						{
							argumentsJson: JSON.stringify({
								pattern: 'toolCallsStart',
								path: '/agent/src/lib/runtime/daemon/controller.ts'
							}),
							id: 'seed-tool-grep',
							name: 'grep'
						}
					],
					type: 'toolCallsFinish'
				},
				type: 'event'
			}
		},
		{
			direction: 'workerToDaemon',
			kind: 'workerEvent',
			payload: {
				event: {
					content:
						'This seeded conversation is here so the transcript has some depth, but the best way to exercise live tool rows is to send a fresh prompt and watch the worker stream tool calls into the turn in real time.',
					model: 'accounts/fireworks/models/kimi-k2p5',
					provider: 'fireworks',
					type: 'completed'
				},
				type: 'event'
			}
		}
	]),
	...createTranscriptTurn('dev-tools-2', [
		{
			direction: 'daemonToWorker',
			kind: 'turnInput',
			payload: {
				conversationTitle: 'Show me something tool-heavy.',
				messages: [
					'Perfect. I mainly need a rich dev dataset so I can inspect sessions, memory, long transcripts, and failure copy without manually recreating everything each time.'
				],
				turnId: 'dev-tools-2'
			}
		},
		{
			direction: 'workerToDaemon',
			kind: 'hostToolRequest',
			payload: {
				argumentsJson: JSON.stringify({
					action: 'write',
					content: 'Persist transcript tool rows for full-turn visibility.',
					memory: 'episodic'
				}),
				requestId: 'dev-tool-request-remember',
				toolName: 'remember',
				type: 'hostToolRequest'
			}
		},
		{
			direction: 'daemonToWorker',
			kind: 'hostToolResponse',
			payload: {
				requestId: 'dev-tool-request-remember',
				result: '{"ok":true,"memory":"episodic"}',
				type: 'hostToolResponse'
			}
		},
		{
			direction: 'workerToDaemon',
			kind: 'workerEvent',
			payload: {
				event: {
					content:
						'That is exactly what this `.runtime` bootstrap is for. It seeds conversations, memory, todos, and a sample skill the first time the repo-local dev runtime is created.',
					model: 'accounts/fireworks/models/kimi-k2p5',
					provider: 'fireworks',
					type: 'completed'
				},
				type: 'event'
			}
		}
	])
]

function createTranscriptTurn(turnId: string, entries: SeedTranscriptTurnEntry[]): SeedWorkerTranscriptEntry[] {
	return entries.map((entry, index) => ({
		direction: entry.direction,
		kind: entry.kind,
		payloadJson: JSON.stringify(entry.payload),
		sequence: index,
		turnId
	}))
}
