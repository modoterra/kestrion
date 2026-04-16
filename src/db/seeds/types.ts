import type { InferenceToolCall, WorkerTranscriptEntry } from '../../lib/types'

export type SeedConversation = Array<{ content: string; role: 'assistant' | 'user' }>

export type SeedWorkerTranscriptEntry = Omit<WorkerTranscriptEntry, 'conversationId' | 'createdAt' | 'id'> & {
	createdAt?: string
}

export type SeedConversationFixture = {
	messages: SeedConversation
	toolCallBatches?: InferenceToolCall[][]
	workerTranscriptEntries?: SeedWorkerTranscriptEntry[]
}

export type SeedMemoryFixture = {
	content: string
	memory: 'episodic' | 'long-term' | 'scratch'
	mode?: 'append' | 'replace'
	tags?: string[]
	title?: string
}

export type SeedTodoFixture = { content: string; done: boolean }
