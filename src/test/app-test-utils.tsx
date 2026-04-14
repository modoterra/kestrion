import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { testRender } from '@opentui/react/test-utils'
import { act } from 'react'

import { App } from '../app'
import { createRenderAppContext, type RenderAppMemory } from './render-app-context'

type RenderAppOptions = {
	apiKeyConfigured?: boolean
	height?: number
	memory?: RenderAppMemory
	messages?: Array<{ content: string; role: 'assistant' | 'user' }>
	onExit?: () => void
	providerConfigured?: boolean
	savedConversations?: Array<Array<{ content: string; role: 'assistant' | 'user' }>>
	width?: number
}

type TestSetup = Awaited<ReturnType<typeof testRender>>
type RenderAppContext = ReturnType<typeof createRenderAppContext>

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
	const { config, paths, service, store, writableConfig } = createRenderAppContext(homeDir, options)
	cleanupTasks.push(() => {
		store.close()
	})
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
	service: RenderAppContext['service'],
	store: RenderAppContext['store'],
	config: RenderAppContext['config'],
	conversations: Array<Array<{ content: string; role: 'assistant' | 'user' }>>
): Promise<void> {
	return seedSavedConversationAtIndex(service, store, config, conversations, 0)
}

function seedSavedConversationAtIndex(
	service: RenderAppContext['service'],
	store: RenderAppContext['store'],
	config: RenderAppContext['config'],
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

function seedConversationThread(
	service: RenderAppContext['service'],
	store: RenderAppContext['store'],
	config: RenderAppContext['config'],
	messages: Array<{ content: string; role: 'assistant' | 'user' }>
): ReturnType<RenderAppContext['service']['createDraftConversation']> {
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
	store: RenderAppContext['store'],
	service: RenderAppContext['service'],
	config: RenderAppContext['config'],
	thread: ReturnType<RenderAppContext['service']['createDraftConversation']>,
	content: string
): ReturnType<RenderAppContext['service']['createDraftConversation']> {
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
