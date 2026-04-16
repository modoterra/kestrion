/* eslint-disable import/max-dependencies */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { DEV_MEMORY_SEEDS, DEV_SEED_CONVERSATIONS, DEV_SKILLS, DEV_TODOS } from '../db/seeds/dev'
import type { SeedConversationFixture } from '../db/seeds/types'
import { loadWritableAppConfig, saveAppConfig } from '../lib/config'
import type { AppPaths } from '../lib/paths'
import { AgentService, toConversationTitle } from '../lib/services/agent-service'
import { ConversationStore } from '../lib/storage/conversation-store'
import { createTestingToolPolicy } from '../lib/tools/policy'
import { runRememberTool } from '../lib/tools/remember'
import { runTodoTool } from '../lib/tools/todo'

type SeedConversationThread = ReturnType<AgentService['createDraftConversation']>

export function ensureDevSeedData(paths: AppPaths): void {
	ensureDevMatrixPrompt(paths)
	const writableConfig = loadWritableAppConfig(paths)
	writableConfig.providers.fireworks.providerMode ??= 'fireworks'
	const config = saveAppConfig(paths, writableConfig)
	const store = new ConversationStore(paths.databaseFile)

	try {
		store.saveToolPolicy(createTestingToolPolicy())
		const existingConversations = store.listConversations(20)
		if (existingConversations.length > 0) {
			backfillSeededConversations(store, existingConversations)
			return
		}

		const service = new AgentService(store, config)
		seedConversations(service, store, config)
		seedMemory(paths)
		seedTodos(paths)
		seedSkills(paths)
	} finally {
		store.close()
	}
}

function backfillSeededConversations(
	store: ConversationStore,
	conversations: ReturnType<ConversationStore['listConversations']>
): void {
	for (const fixture of DEV_SEED_CONVERSATIONS) {
		const seededConversation = findSeededConversation(conversations, fixture)
		if (!seededConversation) {
			continue
		}

		const thread = store.getConversation(seededConversation.id)
		if (!thread) {
			continue
		}

		if ((fixture.toolCallBatches?.length ?? 0) > 0 && thread.toolCallMessages.length === 0) {
			seedConversationToolCalls(store, thread, fixture.toolCallBatches ?? [])
		}

		if ((fixture.workerTranscriptEntries?.length ?? 0) > 0) {
			const existingTranscript = store.listConversationWorkerTranscript(thread.conversation.id)
			if (existingTranscript.length === 0) {
				seedConversationWorkerTranscript(store, thread, fixture.workerTranscriptEntries ?? [])
			}
		}
	}
}

function seedConversations(
	service: AgentService,
	store: ConversationStore,
	config: ReturnType<typeof saveAppConfig>
): void {
	for (const conversation of DEV_SEED_CONVERSATIONS) {
		let thread = service.createDraftConversation()

		for (const message of conversation.messages) {
			thread =
				message.role === 'user'
					? service.addUserMessage(thread.conversation.id, message.content)
					: appendAssistantMessage(store, service, config, thread, message.content)
		}

		seedConversationToolCalls(store, thread, conversation.toolCallBatches ?? [])
		seedConversationWorkerTranscript(store, thread, conversation.workerTranscriptEntries ?? [])
	}
}

function appendAssistantMessage(
	store: ConversationStore,
	service: AgentService,
	config: ReturnType<typeof saveAppConfig>,
	thread: SeedConversationThread,
	content: string
): SeedConversationThread {
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

function seedConversationToolCalls(
	store: ConversationStore,
	thread: SeedConversationThread,
	toolCallBatches: NonNullable<SeedConversationFixture['toolCallBatches']>
): void {
	let nextCreatedAt = nextSeedTimestamp(thread)

	for (const toolCalls of toolCallBatches) {
		const message = store.appendToolCallMessage({
			conversationId: thread.conversation.id,
			createdAt: nextCreatedAt,
			status: 'completed',
			toolCalls
		})
		store.markToolCallMessageCompleted(message.id)
		nextCreatedAt = addSeedMilliseconds(nextCreatedAt, 1_000)
	}
}

function seedConversationWorkerTranscript(
	store: ConversationStore,
	thread: SeedConversationThread,
	workerTranscriptEntries: NonNullable<SeedConversationFixture['workerTranscriptEntries']>
): void {
	let nextCreatedAt = nextSeedTimestamp(thread)

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
		nextCreatedAt = addSeedMilliseconds(createdAt, 1_000)
	}
}

function nextSeedTimestamp(thread: SeedConversationThread): string {
	const lastMessage = thread.messages.at(-1)
	const lastToolCallMessage = thread.toolCallMessages.at(-1)
	const latestTimestamp =
		lastToolCallMessage && lastToolCallMessage.createdAt > (lastMessage?.createdAt ?? '')
			? lastToolCallMessage.createdAt
			: (lastMessage?.createdAt ?? thread.conversation.createdAt)

	return addSeedMilliseconds(latestTimestamp, 1_000)
}

function addSeedMilliseconds(timestamp: string, amount: number): string {
	return new Date(new Date(timestamp).getTime() + amount).toISOString()
}

function findSeededConversation(
	conversations: ReturnType<ConversationStore['listConversations']>,
	fixture: SeedConversationFixture
): (typeof conversations)[number] | undefined {
	const firstUserMessage = fixture.messages.find(message => message.role === 'user')?.content
	if (!firstUserMessage) {
		return undefined
	}

	return conversations.find(conversation => conversation.title === toConversationTitle(firstUserMessage))
}

function seedMemory(paths: AppPaths): void {
	for (const memory of DEV_MEMORY_SEEDS) {
		runRememberTool({ action: 'write', ...memory }, { appPaths: paths })
	}
}

function seedTodos(paths: AppPaths): void {
	for (const todo of DEV_TODOS) {
		runTodoTool({ action: 'add', ...todo }, { appPaths: paths })
	}
}

function seedSkills(paths: AppPaths): void {
	for (const skill of DEV_SKILLS) {
		const skillDirectory = join(paths.skillsDir, skill.name)
		if (!existsSync(skillDirectory)) {
			mkdirSync(skillDirectory, { recursive: true })
		}

		writeFileSync(join(skillDirectory, 'SKILL.md'), skill.content, 'utf8')
	}
}

function ensureDevMatrixPrompt(paths: AppPaths): void {
	const matrixPromptPath = join(paths.configDir, 'MATRIX.md')
	if (existsSync(matrixPromptPath)) {
		return
	}

	writeFileSync(
		matrixPromptPath,
		'# MATRIX\n\nUse the seeded dev instructions and keep responses concise in the test terminal.\n',
		'utf8'
	)
}
