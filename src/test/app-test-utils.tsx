import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { testRender } from '@opentui/react/test-utils'
import { act } from 'react'

import { App } from '../app'
import type { ToolPolicy } from '../lib/tools/policy'
import { createRenderAppBootstrap, type RenderAppMemory } from './render-app-bootstrap'
import { seedConversationThread, seedSavedConversations, type SeededConversationFixture } from './seeded-conversations'

type RenderAppOptions = {
	apiKeyConfigured?: boolean
	configureToolPolicy?: (policy: ToolPolicy) => ToolPolicy
	height?: number
	memory?: RenderAppMemory
	matrixConfigured?: boolean
	messages?: Array<{ content: string; role: 'assistant' | 'user' }>
	onExit?: () => void
	providerConfigured?: boolean
	savedConversations?: SeededConversationFixture[]
	width?: number
}

type TestSetup = Awaited<ReturnType<typeof testRender>>

let testSetup: TestSetup | null = null
const cleanupTasks: Array<() => void | Promise<void>> = []

export async function cleanupRenderedApp(): Promise<void> {
	act(() => {
		testSetup?.renderer.destroy()
	})
	testSetup = null

	await Promise.all(
		cleanupTasks
			.splice(0)
			.toReversed()
			.map(cleanup => cleanup())
	)
}

export function getTestSetup(): TestSetup {
	if (!testSetup) {
		throw new Error('No rendered app is available.')
	}

	return testSetup
}

export async function renderApp(options: RenderAppOptions = {}): Promise<TestSetup> {
	const homeDir = createHomeDir()
	const { agentService, appService, config, controller, paths, store, writableConfig } = await createRenderAppBootstrap(
		homeDir,
		options
	)
	await seedSavedConversations(agentService, store, config, options.savedConversations ?? [])
	if (options.messages && options.messages.length > 0) {
		seedConversationThread(agentService, store, config, options.messages)
	}
	cleanupTasks.push(() => {
		store.close()
	})
	const bootstrap = await controller.bootstrap()

	testSetup = await testRender(
		<App
			buildLabel='v1.33.4 (test)'
			config={bootstrap.config}
			fireworksModels={bootstrap.fireworksModels}
			initialConversations={bootstrap.conversations}
			initialThread={bootstrap.thread}
			initialWritableConfig={writableConfig}
			onExit={options.onExit}
			paths={paths}
			service={appService}
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

function createHomeDir(): string {
	const homeDir = mkdtempSync(join(tmpdir(), 'kestrion-app-'))
	cleanupTasks.push(() => {
		rmSync(homeDir, { force: true, recursive: true })
	})

	return homeDir
}
