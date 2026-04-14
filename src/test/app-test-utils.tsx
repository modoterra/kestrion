import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { testRender } from '@opentui/react/test-utils'
import { act } from 'react'

import { App } from '../app'
import { AgentService } from '../lib/agent-service'
import { loadWritableAppConfig, saveAppConfig } from '../lib/config'
import { ConversationStore } from '../lib/conversation-store'
import { resolveAppPaths } from '../lib/paths'

type RenderAppOptions = {
	apiKeyConfigured?: boolean
	height?: number
	messages?: Array<{ content: string; role: 'assistant' | 'user' }>
	onExit?: () => void
	providerConfigured?: boolean
	savedConversations?: Array<Array<{ content: string; role: 'assistant' | 'user' }>>
	width?: number
}

type TestSetup = Awaited<ReturnType<typeof testRender>>

let testSetup: TestSetup | null = null
const cleanupTasks: Array<() => void> = []

export function cleanupRenderedApp(): void {
	act(() => {
		testSetup?.renderer.destroy()
	})
	testSetup = null

	for (const cleanup of cleanupTasks.splice(0).toReversed()) {
		cleanup()
	}
}

export function getTestSetup(): TestSetup {
	if (!testSetup) {
		throw new Error('No rendered app is available.')
	}

	return testSetup
}

export async function renderApp(options: RenderAppOptions = {}): Promise<TestSetup> {
	const homeDir = createHomeDir()
	const paths = resolveAppPaths({ homeDir })
	const writableConfig = createWritableConfig(paths, options)
	const config = saveAppConfig(paths, writableConfig)
	const store = createConversationStore(paths.databaseFile)
	const service = new AgentService(store, config)
	await seedSavedConversations(service, store, config, options.savedConversations ?? [])
	const thread =
		options.messages && options.messages.length > 0
			? seedConversationThread(service, store, config, options.messages)
			: service.getStartupThread()

	testSetup = await testRender(
		<App
			buildLabel='v1.33.4 (test)'
			config={config}
			initialConversations={service.listConversations()}
			initialThread={thread}
			initialWritableConfig={writableConfig}
			onExit={options.onExit}
			paths={paths}
			service={service}
		/>,
		{ height: options.height ?? 40, kittyKeyboard: true, width: options.width ?? 100 }
	)

	await settleUi()
	return getTestSetup()
}

export async function triggerUiUpdate(action: () => void | Promise<void>): Promise<void> {
	await act(async () => {
		await action()
		await settleUi()
	})
}

export async function settleUi(): Promise<void> {
	const renderedApp = getTestSetup()
	await Promise.resolve()
	await renderedApp.renderOnce()
	await Promise.resolve()
	await renderedApp.renderOnce()
}

export function waitForFrameContent(
	matcher: (frame: string) => boolean,
	options: { attempts?: number; delayMs?: number } = {}
): Promise<string> {
	const attempts = options.attempts ?? 8
	const delayMs = options.delayMs ?? 25

	return waitForFrameContentAttempt(matcher, getTestSetup().captureCharFrame(), attempts, delayMs)
}

async function waitForFrameContentAttempt(
	matcher: (frame: string) => boolean,
	frame: string,
	attemptsRemaining: number,
	delayMs: number
): Promise<string> {
	if (matcher(frame) || attemptsRemaining <= 0) {
		return frame
	}

	await act(async () => {
		await delay(delayMs)
	})
	await settleUi()

	return waitForFrameContentAttempt(matcher, getTestSetup().captureCharFrame(), attemptsRemaining - 1, delayMs)
}

export async function reopenCurrentSessionFromOverlay(): Promise<void> {
	await triggerUiUpdate(() => {
		getTestSetup().mockInput.pressKey('r', { ctrl: true })
	})

	await waitForFrameContent(renderedFrame => renderedFrame.includes('Search sessions'))

	await triggerUiUpdate(() => {
		getTestSetup().mockInput.pressEnter()
	})

	await waitForFrameContent(renderedFrame => !renderedFrame.includes('Search sessions'))
}

export async function openCommandPalette(): Promise<string> {
	await triggerUiUpdate(() => {
		getTestSetup().mockInput.pressKey('k', { ctrl: true })
	})

	return waitForFrameContent(renderedFrame => renderedFrame.includes('Search commands'))
}

export async function submitComposerMessageAndWaitForReply(message: string, reply: string): Promise<string> {
	await triggerUiUpdate(async () => {
		await getTestSetup().mockInput.typeText(message)
	})

	await triggerUiUpdate(() => {
		getTestSetup().mockInput.pressEnter()
	})

	return waitForFrameContent(renderedFrame => renderedFrame.includes(reply))
}

function delay(ms: number): Promise<void> {
	return new Promise(resolve => {
		setTimeout(resolve, ms)
	})
}

function seedSavedConversations(
	service: AgentService,
	store: ConversationStore,
	config: ReturnType<typeof saveAppConfig>,
	conversations: Array<Array<{ content: string; role: 'assistant' | 'user' }>>
): Promise<void> {
	return seedSavedConversationAtIndex(service, store, config, conversations, 0)
}

function seedSavedConversationAtIndex(
	service: AgentService,
	store: ConversationStore,
	config: ReturnType<typeof saveAppConfig>,
	conversations: Array<Array<{ content: string; role: 'assistant' | 'user' }>>,
	index: number
): Promise<void> {
	const messages = conversations[index]
	if (!messages) {
		return Promise.resolve()
	}

	seedConversationThread(service, store, config, messages)
	return delay(2).then(() => seedSavedConversationAtIndex(service, store, config, conversations, index + 1))
}

function createHomeDir(): string {
	const homeDir = mkdtempSync(join(tmpdir(), 'kestrion-app-'))
	cleanupTasks.push(() => {
		rmSync(homeDir, { force: true, recursive: true })
	})

	return homeDir
}

function createWritableConfig(
	paths: ReturnType<typeof resolveAppPaths>,
	options: RenderAppOptions
): ReturnType<typeof loadWritableAppConfig> {
	const writableConfig = loadWritableAppConfig(paths)
	writableConfig.providers.fireworks.providerMode = (options.providerConfigured ?? true) ? 'fireworks' : null

	if (options.apiKeyConfigured ?? true) {
		writableConfig.providers.fireworks.apiKey = 'test-api-key'
	}

	return writableConfig
}

function createConversationStore(databaseFile: string): ConversationStore {
	const store = new ConversationStore(databaseFile)
	cleanupTasks.push(() => {
		store.close()
	})

	return store
}

function seedConversationThread(
	service: AgentService,
	store: ConversationStore,
	config: ReturnType<typeof saveAppConfig>,
	messages: Array<{ content: string; role: 'assistant' | 'user' }>
): ReturnType<AgentService['createDraftConversation']> {
	let thread = service.createDraftConversation()

	for (const message of messages) {
		thread =
			message.role === 'user'
				? service.addUserMessage(thread.conversation.id, message.content)
				: appendAssistantMessage(store, service, config, thread, message.content)
	}

	return thread
}

function appendAssistantMessage(
	store: ConversationStore,
	service: AgentService,
	config: ReturnType<typeof saveAppConfig>,
	thread: ReturnType<AgentService['createDraftConversation']>,
	content: string
): ReturnType<AgentService['createDraftConversation']> {
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
