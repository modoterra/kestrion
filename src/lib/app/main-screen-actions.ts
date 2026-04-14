import type { TextareaRenderable } from '@opentui/core'
import { startTransition, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'

import { isDraftConversationId, type AgentService } from '../agent-service'
import type { ConversationSummary, ConversationThread } from '../types'
import { configureShortcutFriendlyField } from '../ui/helpers'

type SetConversations = Dispatch<SetStateAction<ConversationSummary[]>>
type SetThread = Dispatch<SetStateAction<ConversationThread>>

export function useComposerBindings({
	busy,
	composerRef,
	missingProvider,
	setComposer,
	setComposerEpoch,
	viewStackIsActive
}: {
	busy: boolean
	composerRef: MutableRefObject<TextareaRenderable | null>
	missingProvider: boolean
	setComposer: Dispatch<SetStateAction<string>>
	setComposerEpoch: Dispatch<SetStateAction<number>>
	viewStackIsActive: boolean
}): {
	configureComposer: (renderable: TextareaRenderable | null) => void
	focusComposer: () => void
	resetComposer: (nextValue?: string) => void
	syncComposerFromEditor: () => void
} {
	const configureComposer = (renderable: TextareaRenderable | null): void => {
		composerRef.current = renderable
		configureShortcutFriendlyField(renderable)
	}
	const focusComposer = (): void => focusComposerInput(busy, composerRef, missingProvider, viewStackIsActive)
	const resetComposer = (nextValue = ''): void => resetComposerState(setComposer, setComposerEpoch, nextValue)
	const syncComposerFromEditor = (): void => {
		setComposer(composerRef.current?.plainText ?? '')
	}

	return { configureComposer, focusComposer, resetComposer, syncComposerFromEditor }
}

export function useThreadActions({
	activeThreadId,
	busy,
	resetComposer,
	service,
	setActiveThread,
	setConversations,
	setError,
	setStatus
}: {
	activeThreadId: string
	busy: boolean
	resetComposer: (nextValue?: string) => void
	service: AgentService
	setActiveThread: SetThread
	setConversations: SetConversations
	setError: Dispatch<SetStateAction<string | null>>
	setStatus: Dispatch<SetStateAction<string>>
}): {
	applyThread: (thread: ConversationThread, nextStatus: string) => void
	createConversation: () => void
	reloadConversation: () => void
} {
	const applyThread = (thread: ConversationThread, nextStatus: string): void => {
		startTransition(() => {
			setActiveThread(thread)
			setConversations(service.listConversations())
			setStatus(nextStatus)
			setError(null)
		})
	}
	const createConversation = (): void => createFreshConversation(busy, resetComposer, service, applyThread)
	const reloadConversation = (): void =>
		reloadCurrentConversation(activeThreadId, busy, service, applyThread, setStatus)

	return { applyThread, createConversation, reloadConversation }
}

export function useConversationDeletionActions({
	activeThreadId,
	resetComposer,
	service,
	setActiveThread,
	setConversations,
	setStatus,
	sessionsCloseStatusRef
}: {
	activeThreadId: string
	resetComposer: (nextValue?: string) => void
	service: AgentService
	setActiveThread: SetThread
	setConversations: SetConversations
	setStatus: Dispatch<SetStateAction<string>>
	sessionsCloseStatusRef: MutableRefObject<string>
}): { deleteAllConversations: () => void; deleteConversation: (conversationId: string) => void } {
	const deleteAllConversations = (): void =>
		clearAllConversations(resetComposer, service, setActiveThread, setConversations, setStatus, sessionsCloseStatusRef)
	const deleteConversation = (conversationId: string): void =>
		removeConversation(
			activeThreadId,
			conversationId,
			resetComposer,
			service,
			setActiveThread,
			setConversations,
			setStatus,
			sessionsCloseStatusRef
		)

	return { deleteAllConversations, deleteConversation }
}

function focusComposerInput(
	busy: boolean,
	composerRef: MutableRefObject<TextareaRenderable | null>,
	missingProvider: boolean,
	viewStackIsActive: boolean
): void {
	if (viewStackIsActive || missingProvider || busy) {
		return
	}

	setTimeout(() => {
		const composerRenderable = composerRef.current
		if (!composerRenderable || composerRenderable.isDestroyed) {
			return
		}

		composerRenderable.focus()
	}, 1)
}

function resetComposerState(
	setComposer: Dispatch<SetStateAction<string>>,
	setComposerEpoch: Dispatch<SetStateAction<number>>,
	nextValue: string
): void {
	setComposer(nextValue)
	setComposerEpoch(value => value + 1)
}

function createFreshConversation(
	busy: boolean,
	resetComposer: (nextValue?: string) => void,
	service: AgentService,
	applyThread: (thread: ConversationThread, nextStatus: string) => void
): void {
	if (busy) {
		return
	}

	const thread = service.createDraftConversation()
	resetComposer()
	applyThread(thread, 'Fresh session ready.')
}

function reloadCurrentConversation(
	activeThreadId: string,
	busy: boolean,
	service: AgentService,
	applyThread: (thread: ConversationThread, nextStatus: string) => void,
	setStatus: Dispatch<SetStateAction<string>>
): void {
	if (busy) {
		return
	}

	if (isDraftConversationId(activeThreadId)) {
		setStatus('Draft conversation is not saved yet.')
		return
	}

	applyThread(service.loadConversation(activeThreadId), 'Conversation reloaded.')
}

function clearAllConversations(
	resetComposer: (nextValue?: string) => void,
	service: AgentService,
	setActiveThread: SetThread,
	setConversations: SetConversations,
	setStatus: Dispatch<SetStateAction<string>>,
	sessionsCloseStatusRef: MutableRefObject<string>
): void {
	service.deleteAllConversations()
	resetComposer()
	setConversations([])
	setActiveThread(service.createDraftConversation())
	sessionsCloseStatusRef.current = 'All conversations deleted.'
	setStatus('All conversations deleted.')
}

function removeConversation(
	activeThreadId: string,
	conversationId: string,
	resetComposer: (nextValue?: string) => void,
	service: AgentService,
	setActiveThread: SetThread,
	setConversations: SetConversations,
	setStatus: Dispatch<SetStateAction<string>>,
	sessionsCloseStatusRef: MutableRefObject<string>
): void {
	service.deleteConversation(conversationId)
	setConversations(service.listConversations())

	if (activeThreadId === conversationId) {
		resetComposer()
		setActiveThread(service.createDraftConversation())
	}

	sessionsCloseStatusRef.current = 'Conversation deleted.'
	setStatus('Conversation deleted.')
}
