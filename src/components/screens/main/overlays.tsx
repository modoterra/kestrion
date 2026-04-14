import { type Dispatch, type MutableRefObject, type ReactNode, type SetStateAction } from 'react'

import type { AppProps } from '../../../lib/app/types'
import { saveAppConfig, type ResolvedAppConfig, type WritableAppConfig } from '../../../lib/config'
import { toErrorMessage } from '../../../lib/errors'
import { buildWritableConfig, toProviderDraft } from '../../../lib/provider-config/draft-utils'
import type { ProviderDraft } from '../../../lib/provider-config/fields'
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

export function useProviderOverlayActions({
	busy,
	paths,
	providerCloseStatusRef,
	service,
	setError,
	setResolvedConfig,
	setStatus,
	setWritableConfig,
	viewStack,
	writableConfig
}: {
	busy: boolean
	paths: AppProps['paths']
	providerCloseStatusRef: MutableRefObject<string>
	service: AppProps['service']
	setError: Dispatch<SetStateAction<string | null>>
	setResolvedConfig: Dispatch<SetStateAction<ResolvedAppConfig>>
	setStatus: Dispatch<SetStateAction<string>>
	setWritableConfig: Dispatch<SetStateAction<WritableAppConfig>>
	viewStack: ViewStackControls
	writableConfig: WritableAppConfig
}): { openProviderConfig: () => void; saveProviderConfig: (draft: ProviderDraft) => string | null } {
	const saveProviderConfig = (draft: ProviderDraft): string | null =>
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
			createProviderConfigEntry(providerCloseStatusRef, saveProviderConfig, service, setStatus, writableConfig)
		)
		setStatus('Editing provider settings.')
	}

	return { openProviderConfig, saveProviderConfig }
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
}: {
	activeThreadId: string
	applyThread: (thread: AppProps['initialThread'], nextStatus: string) => void
	busy: boolean
	conversations: AppProps['initialConversations']
	deleteAllConversations: () => void
	deleteConversation: (conversationId: string) => void
	resetComposer: (nextValue?: string) => void
	service: AppProps['service']
	sessionsCloseStatusRef: MutableRefObject<string>
	setStatus: Dispatch<SetStateAction<string>>
	viewStack: ViewStackControls
}): { openSessionsView: () => void } {
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

function saveProviderDraft(
	draft: ProviderDraft,
	paths: AppProps['paths'],
	providerCloseStatusRef: MutableRefObject<string>,
	service: AppProps['service'],
	setError: Dispatch<SetStateAction<string | null>>,
	setResolvedConfig: Dispatch<SetStateAction<ResolvedAppConfig>>,
	setStatus: Dispatch<SetStateAction<string>>,
	setWritableConfig: Dispatch<SetStateAction<WritableAppConfig>>,
	writableConfig: WritableAppConfig
): string | null {
	try {
		const nextWritableConfig = buildWritableConfig(writableConfig, draft)
		const nextResolvedConfig = saveAppConfig(paths, nextWritableConfig)
		service.updateConfig(nextResolvedConfig)
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

function createProviderConfigEntry(
	providerCloseStatusRef: MutableRefObject<string>,
	saveProviderConfig: (draft: ProviderDraft) => string | null,
	service: AppProps['service'],
	setStatus: Dispatch<SetStateAction<string>>,
	writableConfig: WritableAppConfig
): ViewStackEntry {
	return {
		element: (
			<ProviderConfigScreen
				fireworksModels={service.listProviderModels('fireworks')}
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

function createSessionsViewEntry(
	activeThreadId: string,
	applyThread: (thread: AppProps['initialThread'], nextStatus: string) => void,
	conversations: AppProps['initialConversations'],
	deleteAllConversations: () => void,
	deleteConversation: (conversationId: string) => void,
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
				onOpen={conversationId => {
					const thread = service.loadConversation(conversationId)
					const nextStatus = `Loaded ${thread.conversation.title}.`
					sessionsCloseStatusRef.current = nextStatus
					resetComposer()
					applyThread(thread, nextStatus)
					viewStack.pop()
				}}
			/>
		),
		onPop: () => {
			setStatus(sessionsCloseStatusRef.current)
		}
	}
}
