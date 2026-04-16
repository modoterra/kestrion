import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { type Dispatch, type MutableRefObject, type ReactNode, type SetStateAction } from 'react'

import type { AppProps } from '../../../lib/app/types'
import { loadAppConfig, saveAppConfig, type ResolvedAppConfig, type WritableAppConfig } from '../../../lib/config'
import { toErrorMessage } from '../../../lib/errors'
import type { MatrixDraft } from '../../../lib/matrix-config/fields'
import { generateMatrixMarkdown } from '../../../lib/matrix-config/utils'
import { buildWritableConfig, toProviderDraft } from '../../../lib/provider-config/draft-utils'
import type { ProviderDraft } from '../../../lib/provider-config/fields'
import { MatrixConfigScreen } from '../matrix-config/screen'
import { ProviderConfigScreen } from '../provider-config/screen'
import { SessionsScreen } from '../sessions/screen'
import { ShortcutsScreen } from '../shortcuts/screen'
import { ToolsScreen } from '../tools/screen'

type ViewStackEntry = { element: ReactNode; onPop?: () => void }
type ViewStackControls = {
	current: ViewStackEntry | null
	isActive: boolean
	pop: () => void
	push: (entry: ViewStackEntry) => void
}
type ProviderOverlayArgs = {
	busy: boolean
	fireworksModels: AppProps['fireworksModels']
	paths: AppProps['paths']
	providerCloseStatusRef: MutableRefObject<string>
	service: AppProps['service']
	setError: Dispatch<SetStateAction<string | null>>
	setResolvedConfig: Dispatch<SetStateAction<ResolvedAppConfig>>
	setStatus: Dispatch<SetStateAction<string>>
	setWritableConfig: Dispatch<SetStateAction<WritableAppConfig>>
	viewStack: ViewStackControls
	writableConfig: WritableAppConfig
}
type MatrixOverlayArgs = {
	busy: boolean
	matrixCloseStatusRef: MutableRefObject<string>
	paths: AppProps['paths']
	resolvedConfig: ResolvedAppConfig
	service: AppProps['service']
	setError: Dispatch<SetStateAction<string | null>>
	setResolvedConfig: Dispatch<SetStateAction<ResolvedAppConfig>>
	setStatus: Dispatch<SetStateAction<string>>
	viewStack: ViewStackControls
}
type SessionsOverlayArgs = {
	activeThreadId: string
	applyThread: (
		thread: AppProps['initialThread'],
		conversations: AppProps['initialConversations'],
		nextStatus: string
	) => void
	busy: boolean
	conversations: AppProps['initialConversations']
	deleteAllConversations: () => Promise<void>
	deleteConversation: (conversationId: string) => Promise<void>
	resetComposer: (nextValue?: string) => void
	service: AppProps['service']
	sessionsCloseStatusRef: MutableRefObject<string>
	setStatus: Dispatch<SetStateAction<string>>
	viewStack: ViewStackControls
}

export function useProviderOverlayActions({
	busy,
	fireworksModels,
	paths,
	providerCloseStatusRef,
	service,
	setError,
	setResolvedConfig,
	setStatus,
	setWritableConfig,
	viewStack,
	writableConfig
}: ProviderOverlayArgs): {
	openProviderConfig: () => void
	saveProviderConfig: (draft: ProviderDraft) => Promise<string | null>
} {
	const saveProviderConfig = (draft: ProviderDraft): Promise<string | null> =>
		saveProviderDraft(
			draft,
			paths,
			providerCloseStatusRef,
			service,
			setError,
			setResolvedConfig,
			setStatus,
			setWritableConfig,
			writableConfig
		)
	const openProviderConfig = (): void => {
		if (busy || viewStack.isActive) {
			return
		}

		providerCloseStatusRef.current = 'Provider editor closed.'
		setError(null)
		viewStack.push(
			createProviderConfigEntry(providerCloseStatusRef, saveProviderConfig, fireworksModels, setStatus, writableConfig)
		)
		setStatus('Editing provider settings.')
	}

	return { openProviderConfig, saveProviderConfig }
}

export function useMatrixOverlayActions({
	busy,
	matrixCloseStatusRef,
	paths,
	resolvedConfig,
	service,
	setError,
	setResolvedConfig,
	setStatus,
	viewStack
}: MatrixOverlayArgs): {
	openMatrixSetup: () => void
	saveMatrixDraft: (draft: MatrixDraft) => Promise<string | null>
} {
	const saveMatrixDraft = (draft: MatrixDraft): Promise<string | null> =>
		saveMatrixConfigDraft(draft, matrixCloseStatusRef, paths, service, setError, setResolvedConfig, setStatus)
	const openMatrixSetup = (): void => {
		if (busy || viewStack.isActive) {
			return
		}

		matrixCloseStatusRef.current = 'MATRIX setup closed.'
		setError(null)
		viewStack.push(createMatrixConfigEntry(matrixCloseStatusRef, resolvedConfig, saveMatrixDraft, setStatus))
		setStatus('Editing MATRIX.md.')
	}

	return { openMatrixSetup, saveMatrixDraft }
}

export function useSessionsOverlayAction({
	activeThreadId,
	applyThread,
	busy,
	conversations,
	deleteAllConversations,
	deleteConversation,
	resetComposer,
	service,
	sessionsCloseStatusRef,
	setStatus,
	viewStack
}: SessionsOverlayArgs): { openSessionsView: () => void } {
	const openSessionsView = (): void => {
		if (busy || viewStack.isActive) {
			return
		}

		sessionsCloseStatusRef.current = 'Composer ready.'
		viewStack.push(
			createSessionsViewEntry(
				activeThreadId,
				applyThread,
				conversations,
				deleteAllConversations,
				deleteConversation,
				resetComposer,
				service,
				sessionsCloseStatusRef,
				setStatus,
				viewStack
			)
		)
		setStatus('Browsing sessions.')
	}

	return { openSessionsView }
}

export function useShortcutsOverlayAction({
	busy,
	setStatus,
	viewStack
}: {
	busy: boolean
	setStatus: Dispatch<SetStateAction<string>>
	viewStack: ViewStackControls
}): { openShortcutsView: () => void } {
	const openShortcutsView = (): void => {
		if (busy || viewStack.isActive) {
			return
		}

		viewStack.push({ element: <ShortcutsScreen />, onPop: () => setStatus('Composer ready.') })
		setStatus('Browsing shortcuts.')
	}

	return { openShortcutsView }
}

export function useToolsOverlayAction({
	busy,
	setStatus,
	viewStack
}: {
	busy: boolean
	setStatus: Dispatch<SetStateAction<string>>
	viewStack: ViewStackControls
}): { openToolsView: () => void } {
	const openToolsView = (): void => {
		if (busy || viewStack.isActive) {
			return
		}

		viewStack.push({ element: <ToolsScreen />, onPop: () => setStatus('Composer ready.') })
		setStatus('Browsing tools.')
	}

	return { openToolsView }
}

async function saveProviderDraft(
	draft: ProviderDraft,
	paths: AppProps['paths'],
	providerCloseStatusRef: MutableRefObject<string>,
	service: AppProps['service'],
	setError: Dispatch<SetStateAction<string | null>>,
	setResolvedConfig: Dispatch<SetStateAction<ResolvedAppConfig>>,
	setStatus: Dispatch<SetStateAction<string>>,
	setWritableConfig: Dispatch<SetStateAction<WritableAppConfig>>,
	writableConfig: WritableAppConfig
): Promise<string | null> {
	try {
		const nextWritableConfig = buildWritableConfig(writableConfig, draft)
		const nextResolvedConfig = saveAppConfig(paths, nextWritableConfig)
		await service.updateConfig(nextResolvedConfig)
		setWritableConfig(nextWritableConfig)
		setResolvedConfig(nextResolvedConfig)
		setError(null)
		providerCloseStatusRef.current = `Provider settings saved. New sessions use ${nextResolvedConfig.providers.fireworks.model}.`
		return null
	} catch (cause) {
		setStatus('Provider settings are invalid.')
		return toErrorMessage(cause)
	}
}

async function saveMatrixConfigDraft(
	draft: MatrixDraft,
	matrixCloseStatusRef: MutableRefObject<string>,
	paths: AppProps['paths'],
	service: AppProps['service'],
	setError: Dispatch<SetStateAction<string | null>>,
	setResolvedConfig: Dispatch<SetStateAction<ResolvedAppConfig>>,
	setStatus: Dispatch<SetStateAction<string>>
): Promise<string | null> {
	try {
		writeFileSync(join(paths.configDir, 'MATRIX.md'), generateMatrixMarkdown(draft), 'utf8')
		const nextResolvedConfig = loadAppConfig(paths)
		await service.updateConfig(nextResolvedConfig)
		setResolvedConfig(nextResolvedConfig)
		setError(null)
		matrixCloseStatusRef.current = 'MATRIX.md saved. New conversations use it immediately.'
		return null
	} catch (cause) {
		setStatus('MATRIX setup is invalid.')
		return toErrorMessage(cause)
	}
}

function createProviderConfigEntry(
	providerCloseStatusRef: MutableRefObject<string>,
	saveProviderConfig: (draft: ProviderDraft) => Promise<string | null>,
	fireworksModels: AppProps['fireworksModels'],
	setStatus: Dispatch<SetStateAction<string>>,
	writableConfig: WritableAppConfig
): ViewStackEntry {
	return {
		element: (
			<ProviderConfigScreen
				fireworksModels={fireworksModels}
				initialDraft={toProviderDraft(writableConfig)}
				onReset={() => {
					setStatus('Provider form reset to saved settings.')
				}}
				onSave={saveProviderConfig}
			/>
		),
		onPop: () => {
			setStatus(providerCloseStatusRef.current)
		}
	}
}

function createMatrixConfigEntry(
	matrixCloseStatusRef: MutableRefObject<string>,
	resolvedConfig: ResolvedAppConfig,
	saveMatrixDraft: (draft: MatrixDraft) => Promise<string | null>,
	setStatus: Dispatch<SetStateAction<string>>
): ViewStackEntry {
	return {
		element: (
			<MatrixConfigScreen
				fileExists={existsSync(resolvedConfig.matrixPromptPath)}
				matrixPromptPath={resolvedConfig.matrixPromptPath}
				onReset={() => {
					setStatus('MATRIX form reset to defaults.')
				}}
				onSave={saveMatrixDraft}
			/>
		),
		onPop: () => {
			setStatus(matrixCloseStatusRef.current)
		}
	}
}

function createSessionsViewEntry(
	activeThreadId: string,
	applyThread: (
		thread: AppProps['initialThread'],
		conversations: AppProps['initialConversations'],
		nextStatus: string
	) => void,
	conversations: AppProps['initialConversations'],
	deleteAllConversations: () => Promise<void>,
	deleteConversation: (conversationId: string) => Promise<void>,
	resetComposer: (nextValue?: string) => void,
	service: AppProps['service'],
	sessionsCloseStatusRef: MutableRefObject<string>,
	setStatus: Dispatch<SetStateAction<string>>,
	viewStack: ViewStackControls
): ViewStackEntry {
	return {
		element: (
			<SessionsScreen
				conversations={conversations}
				currentConversationId={activeThreadId}
				onDelete={deleteConversation}
				onDeleteAll={deleteAllConversations}
				onOpen={conversationId =>
					openConversationEntry(conversationId, applyThread, resetComposer, service, sessionsCloseStatusRef, viewStack)
				}
			/>
		),
		onPop: () => {
			setStatus(sessionsCloseStatusRef.current)
		}
	}
}

async function openConversationEntry(
	conversationId: string,
	applyThread: (
		thread: AppProps['initialThread'],
		conversations: AppProps['initialConversations'],
		nextStatus: string
	) => void,
	resetComposer: (nextValue?: string) => void,
	service: AppProps['service'],
	sessionsCloseStatusRef: MutableRefObject<string>,
	viewStack: ViewStackControls
): Promise<void> {
	const [thread, conversations] = await Promise.all([
		service.loadConversation(conversationId),
		service.listConversations()
	])
	const nextStatus = `Loaded ${thread.conversation.title}.`
	sessionsCloseStatusRef.current = nextStatus
	resetComposer()
	applyThread(thread, conversations, nextStatus)
	viewStack.pop()
}
