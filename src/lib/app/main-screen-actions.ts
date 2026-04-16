import type { TextareaRenderable } from '@opentui/core'
import { startTransition, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'

import { isDraftConversationId } from '../services/agent-service'
import type { AppService } from '../services/app-service'
import type { ConversationSummary, ConversationThread } from '../types'
import { configureShortcutFriendlyField } from '../ui/helpers'

type SetConversations = Dispatch<SetStateAction<ConversationSummary[]>>
type SetThread = Dispatch<SetStateAction<ConversationThread>>

export function useComposerBindings({
	busy,
	composerRef,
	missingSetup,
	setComposer,
	setComposerEpoch,
	viewStackIsActive
}: {
	busy: boolean
	composerRef: MutableRefObject<TextareaRenderable | null>
	missingSetup: boolean
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
	const focusComposer = (): void => focusComposerInput(busy, composerRef, missingSetup, viewStackIsActive)
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
	service: AppService
	setActiveThread: SetThread
	setConversations: SetConversations
	setError: Dispatch<SetStateAction<string | null>>
	setStatus: Dispatch<SetStateAction<string>>
}): {
	applyThread: (thread: ConversationThread, conversations: ConversationSummary[], nextStatus: string) => void
	createConversation: () => void
	reloadConversation: () => Promise<void>
} {
	const applyThread = (thread: ConversationThread, conversations: ConversationSummary[], nextStatus: string): void => {
		startTransition(() => {
			setActiveThread(thread)
			setConversations(conversations)
			setStatus(nextStatus)
			setError(null)
		})
	}
	const createConversation = (): void => createFreshConversation(busy, resetComposer, service, applyThread)
	const reloadConversation = (): Promise<void> =>
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
	service: AppService
	setActiveThread: SetThread
	setConversations: SetConversations
	setStatus: Dispatch<SetStateAction<string>>
	sessionsCloseStatusRef: MutableRefObject<string>
}): { deleteAllConversations: () => Promise<void>; deleteConversation: (conversationId: string) => Promise<void> } {
	const deleteAllConversations = (): Promise<void> =>
		clearAllConversations(resetComposer, service, setActiveThread, setConversations, setStatus, sessionsCloseStatusRef)
	const deleteConversation = (conversationId: string): Promise<void> =>
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
	missingSetup: boolean,
	viewStackIsActive: boolean
): void {
	if (viewStackIsActive || missingSetup || busy) {
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
	service: AppService,
	applyThread: (thread: ConversationThread, conversations: ConversationSummary[], nextStatus: string) => void
): void {
	if (busy) {
		return
	}

	const thread = service.createDraftConversation()
	resetComposer()
	void service.listConversations().then(conversations => {
		return applyThread(thread, conversations, 'Fresh session ready.')
	})
}

async function reloadCurrentConversation(
	activeThreadId: string,
	busy: boolean,
	service: AppService,
	applyThread: (thread: ConversationThread, conversations: ConversationSummary[], nextStatus: string) => void,
	setStatus: Dispatch<SetStateAction<string>>
): Promise<void> {
	if (busy) {
		return
	}

	if (isDraftConversationId(activeThreadId)) {
		setStatus('Draft conversation is not saved yet.')
		return
	}

	const [thread, conversations] = await Promise.all([
		service.loadConversation(activeThreadId),
		service.listConversations()
	])
	applyThread(thread, conversations, 'Conversation reloaded.')
}

async function clearAllConversations(
	resetComposer: (nextValue?: string) => void,
	service: AppService,
	setActiveThread: SetThread,
	setConversations: SetConversations,
	setStatus: Dispatch<SetStateAction<string>>,
	sessionsCloseStatusRef: MutableRefObject<string>
): Promise<void> {
	await service.deleteAllConversations()
	resetComposer()
	setConversations([])
	setActiveThread(service.createDraftConversation())
	sessionsCloseStatusRef.current = 'All conversations deleted.'
	setStatus('All conversations deleted.')
}

async function removeConversation(
	activeThreadId: string,
	conversationId: string,
	resetComposer: (nextValue?: string) => void,
	service: AppService,
	setActiveThread: SetThread,
	setConversations: SetConversations,
	setStatus: Dispatch<SetStateAction<string>>,
	sessionsCloseStatusRef: MutableRefObject<string>
): Promise<void> {
	await service.deleteConversation(conversationId)
	setConversations(await service.listConversations())

	if (activeThreadId === conversationId) {
		resetComposer()
		setActiveThread(service.createDraftConversation())
	}

	sessionsCloseStatusRef.current = 'Conversation deleted.'
	setStatus('Conversation deleted.')
}
