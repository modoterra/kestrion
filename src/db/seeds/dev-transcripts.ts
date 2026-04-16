import type { SeedWorkerTranscriptEntry } from './types'

type SeedTranscriptTurnEntry = {
	direction: SeedWorkerTranscriptEntry['direction']
	kind: SeedWorkerTranscriptEntry['kind']
	payload: unknown
}

export const DEV_ARCHITECTURE_WORKER_TRANSCRIPT = [
	...createTranscriptTurn('dev-architecture-1', [
		{
			direction: 'daemonToWorker',
			kind: 'turnInput',
			payload: {
				conversationTitle: 'Give me a quick overview of the current CLI architecture.',
				messages: ['Give me a quick overview of the current CLI architecture.'],
				turnId: 'dev-architecture-1'
			}
		},
		{
			direction: 'workerToDaemon',
			kind: 'workerEvent',
			payload: {
				event: {
					delta: 'The app is split into a `kestrion` CLI, a `kestriond` daemon, and sandboxed `kestrionw` workers.',
					type: 'textDelta'
				},
				type: 'event'
			}
		}
	]),
	...createTranscriptTurn('dev-architecture-2', [
		{
			direction: 'daemonToWorker',
			kind: 'turnInput',
			payload: {
				conversationTitle: 'Give me a quick overview of the current CLI architecture.',
				messages: [
					'Nice. Summarize the worker boundary in one paragraph and include the mounted roots plus what is intentionally daemon-owned.'
				],
				turnId: 'dev-architecture-2'
			}
		},
		{
			direction: 'workerToDaemon',
			kind: 'workerEvent',
			payload: {
				event: {
					content:
						'Workers see `/agent`, `/config`, and ephemeral runtime mounts only. Persistent memory, todos, skills, and audit writes stay daemon-owned.',
					model: 'accounts/fireworks/models/kimi-k2p5',
					provider: 'fireworks',
					type: 'completed'
				},
				type: 'event'
			}
		}
	])
]

export const DEV_MARKDOWN_WORKER_TRANSCRIPT = [
	...createTranscriptTurn('dev-markdown-1', [
		{
			direction: 'daemonToWorker',
			kind: 'turnInput',
			payload: {
				conversationTitle: 'Can you show me a longer transcript with markdown and code?',
				messages: ['Can you show me a longer transcript with markdown and code?'],
				turnId: 'dev-markdown-1'
			}
		},
		{
			direction: 'workerToDaemon',
			kind: 'workerEvent',
			payload: { event: { delta: 'Here is a compact rollout summary:\n\n```ts', type: 'textDelta' }, type: 'event' }
		}
	]),
	...createTranscriptTurn('dev-markdown-2', [
		{
			direction: 'daemonToWorker',
			kind: 'turnInput',
			payload: {
				conversationTitle: 'Can you show me a longer transcript with markdown and code?',
				messages: [
					'Great. Also include a reminder that inline errors and tool-call transcript rows are now visible in the conversation itself.'
				],
				turnId: 'dev-markdown-2'
			}
		},
		{
			direction: 'workerToDaemon',
			kind: 'workerEvent',
			payload: {
				event: {
					content:
						'Done. Inline request failures render as conversation rows, and tool activity is preserved as transcript items.',
					model: 'accounts/fireworks/models/kimi-k2p5',
					provider: 'fireworks',
					type: 'completed'
				},
				type: 'event'
			}
		}
	])
]

export const DEV_FAILURE_WORKER_TRANSCRIPT = [
	...createTranscriptTurn('dev-failure-1', [
		{
			direction: 'daemonToWorker',
			kind: 'turnInput',
			payload: {
				conversationTitle: 'What does a failure look like when the provider request breaks?',
				messages: ['What does a failure look like when the provider request breaks?'],
				turnId: 'dev-failure-1'
			}
		},
		{
			direction: 'workerToDaemon',
			kind: 'hostToolError',
			payload: {
				error: 'Missing Fireworks API key. Set FIREWORKS_API_KEY or update /config/config.json.',
				requestId: 'dev-failure-request-1',
				type: 'hostToolError'
			}
		},
		{
			direction: 'workerToDaemon',
			kind: 'workerEvent',
			payload: {
				event: {
					content:
						'Request failed. Missing Fireworks API key. Set `FIREWORKS_API_KEY` or update `/config/config.json`.',
					model: 'accounts/fireworks/models/kimi-k2p5',
					provider: 'fireworks',
					type: 'completed'
				},
				type: 'event'
			}
		}
	]),
	...createTranscriptTurn('dev-failure-2', [
		{
			direction: 'daemonToWorker',
			kind: 'turnInput',
			payload: {
				conversationTitle: 'What does a failure look like when the provider request breaks?',
				messages: ['And how should I recover from that during development?'],
				turnId: 'dev-failure-2'
			}
		},
		{
			direction: 'workerToDaemon',
			kind: 'workerEvent',
			payload: {
				event: {
					content:
						'Export the key in the shell that launches `bun run dev`, then restart the daemon so the runtime config resolves the env-backed provider settings again.',
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
