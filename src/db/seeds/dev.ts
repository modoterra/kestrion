import type { InferenceToolCall } from '../../lib/types'
import { DEV_TOOL_HEAVY_WORKER_TRANSCRIPT } from './dev-tool-transcripts'
import {
	DEV_ARCHITECTURE_WORKER_TRANSCRIPT,
	DEV_FAILURE_WORKER_TRANSCRIPT,
	DEV_MARKDOWN_WORKER_TRANSCRIPT
} from './dev-transcripts'
import type { SeedConversationFixture, SeedMemoryFixture, SeedTodoFixture } from './types'

export const DEV_TOOL_HEAVY_TOOL_CALL_BATCHES: InferenceToolCall[][] = [
	[
		{
			argumentsJson: JSON.stringify({ path: '/agent/src/lib/runtime/daemon/controller.ts' }),
			id: 'seed-tool-read',
			name: 'read'
		},
		{
			argumentsJson: JSON.stringify({ pattern: 'toolCallsStart', path: '/agent/src/lib/runtime/daemon/controller.ts' }),
			id: 'seed-tool-grep',
			name: 'grep'
		}
	],
	[
		{
			argumentsJson: JSON.stringify({
				content: 'Persist transcript tool rows for full-turn visibility.',
				memory: 'episodic'
			}),
			id: 'seed-tool-remember',
			name: 'remember'
		}
	]
]

export const DEV_SEED_CONVERSATIONS: SeedConversationFixture[] = [
	{
		messages: [
			{ content: 'Give me a quick overview of the current CLI architecture.', role: 'user' },
			{
				content:
					'The app is split into a `kestrion` CLI, a `kestriond` daemon, and sandboxed `kestrionw` workers. The CLI is a local TUI client, the daemon owns persistent state and orchestration, and workers run one turn inside the sandbox.',
				role: 'assistant'
			},
			{
				content:
					'Nice. Summarize the worker boundary in one paragraph and include the mounted roots plus what is intentionally daemon-owned.',
				role: 'user'
			},
			{
				content:
					'Workers see `/agent`, `/config`, and ephemeral runtime mounts only. Persistent memory, todos, skills, and audit writes stay daemon-owned, so the worker can ask for those operations without ever seeing the app database or broader host storage directly.',
				role: 'assistant'
			}
		],
		workerTranscriptEntries: DEV_ARCHITECTURE_WORKER_TRANSCRIPT
	},
	{
		messages: [
			{ content: 'Can you show me a longer transcript with markdown and code?', role: 'user' },
			{
				content: [
					'Here is a compact rollout summary:',
					'',
					'```ts',
					'type RuntimeSplit = {',
					"\tcli: 'tui client'",
					"\tdaemon: 'control plane'",
					"\tworker: 'sandboxed turn executor'",
					'}',
					'```',
					'',
					'1. The CLI owns rendering and input only.',
					'2. The daemon owns SQLite, audit, config, and worker lifecycle.',
					'3. The worker executes tools inside the sandbox and reports events back.'
				].join('\n'),
				role: 'assistant'
			},
			{
				content:
					'Great. Also include a reminder that inline errors and tool-call transcript rows are now visible in the conversation itself.',
				role: 'user'
			},
			{
				content:
					'Done. Inline request failures render as conversation rows, and tool activity is preserved as transcript items so the whole turn stays visible after the reply completes.',
				role: 'assistant'
			}
		],
		workerTranscriptEntries: DEV_MARKDOWN_WORKER_TRANSCRIPT
	},
	{
		messages: [
			{ content: 'What does a failure look like when the provider request breaks?', role: 'user' },
			{
				content: 'Request failed. Missing Fireworks API key. Set `FIREWORKS_API_KEY` or update `/config/config.json`.',
				role: 'assistant'
			},
			{ content: 'And how should I recover from that during development?', role: 'user' },
			{
				content:
					'Export the key in the shell that launches `bun run dev`, then restart the daemon so the runtime config resolves the env-backed provider settings again.',
				role: 'assistant'
			}
		],
		workerTranscriptEntries: DEV_FAILURE_WORKER_TRANSCRIPT
	},
	{
		messages: [
			{ content: 'Show me something tool-heavy.', role: 'user' },
			{
				content:
					'This seeded conversation is here so the transcript has some depth, but the best way to exercise live tool rows is to send a fresh prompt and watch the worker stream tool calls into the turn in real time.',
				role: 'assistant'
			},
			{
				content:
					'Perfect. I mainly need a rich dev dataset so I can inspect sessions, memory, long transcripts, and failure copy without manually recreating everything each time.',
				role: 'user'
			},
			{
				content:
					'That is exactly what this `.runtime` bootstrap is for. It seeds conversations, memory, todos, and a sample skill the first time the repo-local dev runtime is created.',
				role: 'assistant'
			}
		],
		toolCallBatches: DEV_TOOL_HEAVY_TOOL_CALL_BATCHES,
		workerTranscriptEntries: DEV_TOOL_HEAVY_WORKER_TRANSCRIPT
	}
]

export const DEV_MEMORY_SEEDS: SeedMemoryFixture[] = [
	{ content: 'Temporary notes live here until they are no longer useful.', memory: 'scratch', mode: 'replace' },
	{
		content: 'The user prefers short summaries before detailed examples.',
		memory: 'episodic',
		tags: ['preferences', 'communication'],
		title: 'Communication style'
	},
	{
		content: 'Keep grocery and household lists grouped by room to make errands faster.',
		memory: 'long-term',
		tags: ['organization', 'home'],
		title: 'List organization habit'
	}
]

export const DEV_TODOS: SeedTodoFixture[] = [
	{ content: 'Pick a dinner recipe for the weekend', done: false },
	{ content: 'Book an annual eye exam', done: false },
	{ content: 'Rotate backup drives', done: true }
]

export const DEV_SKILLS = [
	{
		content: `# Release Notes

You help summarize product changes for collaborators.

## Checklist
- Mention the main user-facing improvements.
- Keep summaries short and readable.
- End with any follow-up risks or open questions.
`,
		name: 'release-notes'
	}
]
