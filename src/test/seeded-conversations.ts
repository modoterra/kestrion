import type { createRenderAppContext } from './render-app-context'

type RenderAppContext = ReturnType<typeof createRenderAppContext>
type RenderConversationThread = ReturnType<RenderAppContext['agentService']['createDraftConversation']>
type SeedToolCallBatch = Parameters<RenderAppContext['store']['appendToolCallMessage']>[0]['toolCalls']

export type SeedWorkerTranscriptEntry = {
	createdAt?: string
	direction: Parameters<RenderAppContext['store']['appendWorkerTranscriptEntry']>[0]['direction']
	kind: Parameters<RenderAppContext['store']['appendWorkerTranscriptEntry']>[0]['kind']
	payloadJson: string
	sequence: number
	turnId: string
}

export type SeededConversationFixture =
	| Array<{ content: string; role: 'assistant' | 'user' }>
	| {
			messages: Array<{ content: string; role: 'assistant' | 'user' }>
			toolCallBatches?: SeedToolCallBatch[]
			workerTranscriptEntries?: SeedWorkerTranscriptEntry[]
	  }

export function seedSavedConversations(
	service: RenderAppContext['agentService'],
	store: RenderAppContext['store'],
	config: RenderAppContext['config'],
	conversations: SeededConversationFixture[]
): Promise<void> {
	return seedSavedConversationAtIndex(service, store, config, conversations, 0)
}

function seedSavedConversationAtIndex(
	service: RenderAppContext['agentService'],
	store: RenderAppContext['store'],
	config: RenderAppContext['config'],
	conversations: SeededConversationFixture[],
	index: number
): Promise<void> {
	const fixture = conversations[index]
	if (!fixture) {
		return Promise.resolve()
	}

	const seededConversation = normalizeSeededConversationFixture(fixture)
	const thread = seedConversationThread(service, store, config, seededConversation.messages)
	seedConversationToolCalls(store, thread, seededConversation.toolCallBatches ?? [])
	seedConversationWorkerTranscript(store, thread, seededConversation.workerTranscriptEntries ?? [])
	return waitForSeedDelay().then(() => seedSavedConversationAtIndex(service, store, config, conversations, index + 1))
}

export function seedConversationThread(
	service: RenderAppContext['agentService'],
	store: RenderAppContext['store'],
	config: RenderAppContext['config'],
	messages: Array<{ content: string; role: 'assistant' | 'user' }>
): RenderConversationThread {
	let thread = service.createDraftConversation()

	for (const message of messages) {
		thread =
			message.role === 'user'
				? service.addUserMessage(thread.conversation.id, message.content)
				: appendAssistantMessage(store, service, config, thread, message.content)
	}

	return thread
}

function seedConversationToolCalls(
	store: RenderAppContext['store'],
	thread: RenderConversationThread,
	toolCallBatches: SeedToolCallBatch[]
): void {
	let nextCreatedAt = addMilliseconds(thread.messages.at(-1)?.createdAt ?? thread.conversation.createdAt, 1_000)

	for (const toolCalls of toolCallBatches) {
		store.appendToolCallMessage({
			conversationId: thread.conversation.id,
			createdAt: nextCreatedAt,
			status: 'completed',
			toolCalls
		})
		nextCreatedAt = addMilliseconds(nextCreatedAt, 1_000)
	}
}

function seedConversationWorkerTranscript(
	store: RenderAppContext['store'],
	thread: RenderConversationThread,
	workerTranscriptEntries: SeedWorkerTranscriptEntry[]
): void {
	let nextCreatedAt = addMilliseconds(thread.messages.at(-1)?.createdAt ?? thread.conversation.createdAt, 1_000)

	for (const entry of workerTranscriptEntries) {
		const createdAt = entry.createdAt ?? nextCreatedAt
		store.appendWorkerTranscriptEntry({
			conversationId: thread.conversation.id,
			createdAt,
			direction: entry.direction,
			kind: entry.kind,
			payloadJson: entry.payloadJson,
			sequence: entry.sequence,
			turnId: entry.turnId
		})
		nextCreatedAt = addMilliseconds(createdAt, 1_000)
	}
}

function normalizeSeededConversationFixture(fixture: SeededConversationFixture): {
	messages: Array<{ content: string; role: 'assistant' | 'user' }>
	toolCallBatches?: SeedToolCallBatch[]
	workerTranscriptEntries?: SeedWorkerTranscriptEntry[]
} {
	return Array.isArray(fixture) ? { messages: fixture } : fixture
}

function appendAssistantMessage(
	store: RenderAppContext['store'],
	service: RenderAppContext['agentService'],
	config: RenderAppContext['config'],
	thread: RenderConversationThread,
	content: string
): RenderConversationThread {
	const savedThread =
		thread.conversation.id === 'draft'
			? store.createConversation({
					model: config.providers.fireworks.model,
					provider: config.defaultProvider,
					title: 'Fresh session'
				})
			: thread

	store.appendMessage({
		content,
		conversationId: savedThread.conversation.id,
		model: config.providers.fireworks.model,
		provider: config.defaultProvider,
		role: 'assistant'
	})

	return service.loadConversation(savedThread.conversation.id)
}

function waitForSeedDelay(): Promise<void> {
	return new Promise(resolve => {
		setTimeout(resolve, 2)
	})
}

function addMilliseconds(timestamp: string, amount: number): string {
	return new Date(new Date(timestamp).getTime() + amount).toISOString()
}
