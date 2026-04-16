/* eslint-disable import/max-dependencies */

import {
	useComposerBindings,
	useConversationDeletionActions,
	useThreadActions
} from '../../../lib/app/main-screen-actions'
import { useMainScreenEffects } from '../../../lib/app/main-screen-effects'
import { useSendPromptAction } from '../../../lib/app/main-screen-prompt'
import { useMainScreenState, type MainScreenState } from '../../../lib/app/main-screen-state'
import type { AppProps } from '../../../lib/app/types'
import { useViewStack } from '../../../lib/navigation/view-stack'
import type { ToolApprovalPrompt, ToolApprovalResponse } from '../../../lib/types'
import {
	useMatrixOverlayActions,
	useProviderOverlayActions,
	useSessionsOverlayAction,
	useShortcutsOverlayAction,
	useToolsOverlayAction
} from './overlays'
import { useCommandPaletteOptions, useCommandPaletteOverlayAction, useMemoryOverlayAction } from './palette'
import { requestToolApproval, useToolExecutionContext } from './tool-execution-context'
import { useTranscriptOverlayAction } from './transcript-overlay'

type MainScreenOverlayActions = {
	openCommandPalette: () => void
	openMemoryView: () => void
	openMatrixSetup: () => void
	openProviderConfig: () => void
	openSessionsView: () => void
	openShortcutsView: () => void
	openTranscriptView: () => void
	openToolsView: () => void
}

type MainScreenCoreActions = ReturnType<typeof useMainScreenCoreActions>

export type MainScreenController = MainScreenState &
	MainScreenOverlayActions & {
		configureComposer: (renderable: Parameters<ReturnType<typeof useComposerBindings>['configureComposer']>[0]) => void
		createConversation: () => void
		focusComposer: () => void
		resetComposer: (nextValue?: string) => void
		sendPrompt: (submittedValue?: string) => Promise<void>
		syncComposerFromEditor: () => void
		viewStack: ReturnType<typeof useViewStack>
	}

export function useMainScreenController(props: AppProps): MainScreenController {
	const viewStack = useViewStack()
	const state = useMainScreenState(props)
	const toolContext = useToolExecutionContext(props.paths, state.setStatus, viewStack)
	const coreActions = useMainScreenCoreActions(props, state, viewStack, viewStack.isActive, toolContext)
	const overlayActions = useMainScreenOverlays(props, state, coreActions, viewStack)

	useMainScreenEffects({
		activeConversationId: state.activeThread.conversation.id,
		activeToolCalls: state.activeToolCalls,
		busy: state.busy,
		composerEpoch: state.composerEpoch,
		composerRef: state.composerRef,
		deferredMessageCount: state.deferredMessages.length,
		missingSetup: state.missingSetup,
		pendingAssistantMessage: state.pendingAssistantMessage,
		setSpinnerFrameIndex: state.setSpinnerFrameIndex,
		toolCallMessages: state.toolCallMessages,
		transcriptRef: state.transcriptRef,
		viewStackIsActive: viewStack.isActive
	})

	return { ...state, ...coreActions, ...overlayActions, viewStack }
}

function useMainScreenOverlays(
	props: AppProps,
	state: MainScreenState,
	coreActions: MainScreenCoreActions,
	viewStack: ReturnType<typeof useViewStack>
): MainScreenOverlayActions {
	const { openMatrixSetup } = useMatrixOverlay(props, state, viewStack)
	const { openProviderConfig } = useProviderOverlay(props, state, viewStack)
	const { openSessionsView } = useSessionsOverlay(props, state, coreActions, viewStack)
	const { openMemoryView, openShortcutsView, openToolsView, openTranscriptView } = useBrowserOverlayActions(
		props.service,
		state.busy,
		state.setStatus,
		viewStack
	)
	const { openCommandPalette } = usePaletteOverlayActions(
		state,
		coreActions,
		openMemoryView,
		openMatrixSetup,
		openProviderConfig,
		openSessionsView,
		openShortcutsView,
		openTranscriptView,
		openToolsView,
		viewStack
	)

	return {
		openCommandPalette,
		openMemoryView,
		openMatrixSetup,
		openProviderConfig,
		openSessionsView,
		openShortcutsView,
		openTranscriptView,
		openToolsView
	}
}

function useMatrixOverlay(
	props: AppProps,
	state: MainScreenState,
	viewStack: ReturnType<typeof useViewStack>
): ReturnType<typeof useMatrixOverlayActions> {
	return useMatrixOverlayActions({
		busy: state.busy,
		matrixCloseStatusRef: state.matrixCloseStatusRef,
		paths: props.paths,
		resolvedConfig: state.resolvedConfig,
		service: props.service,
		setError: state.setError,
		setResolvedConfig: state.setResolvedConfig,
		setStatus: state.setStatus,
		viewStack
	})
}

function useProviderOverlay(
	props: AppProps,
	state: MainScreenState,
	viewStack: ReturnType<typeof useViewStack>
): ReturnType<typeof useProviderOverlayActions> {
	return useProviderOverlayActions({
		busy: state.busy,
		fireworksModels: props.fireworksModels,
		paths: props.paths,
		providerCloseStatusRef: state.providerCloseStatusRef,
		service: props.service,
		setError: state.setError,
		setResolvedConfig: state.setResolvedConfig,
		setStatus: state.setStatus,
		setWritableConfig: state.setWritableConfig,
		viewStack,
		writableConfig: state.writableConfig
	})
}

function useSessionsOverlay(
	props: AppProps,
	state: MainScreenState,
	coreActions: MainScreenCoreActions,
	viewStack: ReturnType<typeof useViewStack>
): ReturnType<typeof useSessionsOverlayAction> {
	return useSessionsOverlayAction({
		activeThreadId: state.activeThread.conversation.id,
		applyThread: coreActions.applyThread,
		busy: state.busy,
		conversations: state.conversations,
		deleteAllConversations: coreActions.deleteAllConversations,
		deleteConversation: coreActions.deleteConversation,
		resetComposer: coreActions.resetComposer,
		service: props.service,
		sessionsCloseStatusRef: state.sessionsCloseStatusRef,
		setStatus: state.setStatus,
		viewStack
	})
}

function useBrowserOverlayActions(
	service: AppProps['service'],
	busy: boolean,
	setStatus: MainScreenState['setStatus'],
	viewStack: ReturnType<typeof useViewStack>
): Pick<MainScreenOverlayActions, 'openMemoryView' | 'openShortcutsView' | 'openToolsView' | 'openTranscriptView'> {
	const { openShortcutsView } = useShortcutsOverlayAction({ busy, setStatus, viewStack })
	const { openMemoryView } = useMemoryOverlayAction({ busy, service, setStatus, viewStack })
	const { openToolsView } = useToolsOverlayAction({ busy, setStatus, viewStack })
	const { openTranscriptView } = useTranscriptOverlayAction({ busy, setStatus, viewStack })

	return { openMemoryView, openShortcutsView, openToolsView, openTranscriptView }
}

function useMainScreenCoreActions(
	props: AppProps,
	state: MainScreenState,
	viewStack: ReturnType<typeof useViewStack>,
	viewStackIsActive: boolean,
	toolContext: ReturnType<typeof useToolExecutionContext>
): ReturnType<typeof useComposerBindings> &
	ReturnType<typeof useThreadActions> &
	ReturnType<typeof useConversationDeletionActions> & { sendPrompt: ReturnType<typeof useSendPromptAction> } {
	const composerBindings = useComposerBindings({
		busy: state.busy,
		composerRef: state.composerRef,
		missingSetup: state.missingSetup,
		setComposer: state.setComposer,
		setComposerEpoch: state.setComposerEpoch,
		viewStackIsActive
	})
	const threadActions = useThreadActions({
		activeThreadId: state.activeThread.conversation.id,
		busy: state.busy,
		resetComposer: composerBindings.resetComposer,
		service: props.service,
		setActiveThread: state.setActiveThread,
		setConversations: state.setConversations,
		setError: state.setError,
		setStatus: state.setStatus
	})
	const deletionActions = useConversationDeletionActions({
		activeThreadId: state.activeThread.conversation.id,
		resetComposer: composerBindings.resetComposer,
		service: props.service,
		setActiveThread: state.setActiveThread,
		setConversations: state.setConversations,
		setStatus: state.setStatus,
		sessionsCloseStatusRef: state.sessionsCloseStatusRef
	})
	const sendPrompt = useMainPromptAction(
		props.service,
		state,
		threadActions.applyThread,
		composerBindings.resetComposer,
		viewStackIsActive,
		toolContext,
		prompt => requestToolApproval(prompt, state.setStatus, viewStack)
	)

	return { ...composerBindings, ...threadActions, ...deletionActions, sendPrompt }
}

function usePaletteOverlayActions(
	state: MainScreenState,
	coreActions: MainScreenCoreActions,
	openMemoryView: () => void,
	openMatrixSetup: () => void,
	openProviderConfig: () => void,
	openSessionsView: () => void,
	openShortcutsView: () => void,
	openTranscriptView: () => void,
	openToolsView: () => void,
	viewStack: ReturnType<typeof useViewStack>
): Pick<MainScreenOverlayActions, 'openCommandPalette'> {
	const commandPaletteOptions = useCommandPaletteOptions({
		createConversation: coreActions.createConversation,
		openMemoryView,
		openMatrixSetup,
		openProviderConfig,
		openSessionsView,
		openShortcutsView,
		openTranscriptView,
		openToolsView,
		reloadConversation: coreActions.reloadConversation
	})

	return useCommandPaletteOverlayAction({
		busy: state.busy,
		commandPaletteOptions,
		pendingPaletteActionRef: state.pendingPaletteActionRef,
		viewStack
	})
}

function useMainPromptAction(
	service: AppProps['service'],
	state: MainScreenState,
	applyThread: ReturnType<typeof useThreadActions>['applyThread'],
	resetComposer: ReturnType<typeof useComposerBindings>['resetComposer'],
	viewStackIsActive: boolean,
	toolContext: ReturnType<typeof useToolExecutionContext>,
	requestApproval: (prompt: ToolApprovalPrompt) => Promise<ToolApprovalResponse>
): ReturnType<typeof useSendPromptAction> {
	return useSendPromptAction({
		activeThreadId: state.activeThread.conversation.id,
		applyThread,
		busy: state.busy,
		composer: state.composer,
		composerRef: state.composerRef,
		inFlightRequest: state.inFlightRequest,
		missingSetup: state.missingSetup,
		providerLabel: state.providerLabel,
		resetComposer,
		service,
		setActiveThread: state.setActiveThread,
		setActiveToolCalls: state.setActiveToolCalls,
		setBusy: state.setBusy,
		setConversations: state.setConversations,
		setError: state.setError,
		mergeWorkerTranscriptEntriesForConversation: state.mergeWorkerTranscriptEntriesForConversation,
		setPendingAssistantMessage: state.setPendingAssistantMessage,
		setStatus: state.setStatus,
		setToolCallMessages: state.setToolCallMessages,
		toolContext,
		requestApproval,
		viewStackIsActive
	})
}
