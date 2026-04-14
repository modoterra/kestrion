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
import type { ToolExecutionContext } from '../../../lib/tools/tool-types'
import {
	useProviderOverlayActions,
	useSessionsOverlayAction,
	useShortcutsOverlayAction,
	useToolsOverlayAction
} from './overlays'
import { useCommandPaletteOptions, useCommandPaletteOverlayAction, useMemoryOverlayAction } from './palette'
import { useToolExecutionContext } from './tool-execution-context'

type MainScreenOverlayActions = {
	openCommandPalette: () => void
	openMemoryView: () => void
	openProviderConfig: () => void
	openSessionsView: () => void
	openShortcutsView: () => void
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
	const coreActions = useMainScreenCoreActions(props, state, viewStack.isActive, toolContext)
	const overlayActions = useMainScreenOverlays(props, state, coreActions, viewStack)

	useMainScreenEffects({
		activeConversationId: state.activeThread.conversation.id,
		activeToolCalls: state.activeToolCalls,
		busy: state.busy,
		composerEpoch: state.composerEpoch,
		composerRef: state.composerRef,
		deferredMessageCount: state.deferredMessages.length,
		missingProvider: state.missingProvider,
		pendingAssistantMessage: state.pendingAssistantMessage,
		setSpinnerFrameIndex: state.setSpinnerFrameIndex,
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
	const { openProviderConfig } = useProviderOverlayActions({
		busy: state.busy,
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
	const { openSessionsView } = useSessionsOverlayAction({
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
	const { openMemoryView, openShortcutsView, openToolsView } = useBrowserOverlayActions(
		props.paths,
		state.busy,
		state.setStatus,
		viewStack
	)
	const { openCommandPalette } = usePaletteOverlayActions(
		state,
		coreActions,
		openMemoryView,
		openProviderConfig,
		openSessionsView,
		openShortcutsView,
		openToolsView,
		viewStack
	)

	return { openCommandPalette, openMemoryView, openProviderConfig, openSessionsView, openShortcutsView, openToolsView }
}

function useBrowserOverlayActions(
	paths: AppProps['paths'],
	busy: boolean,
	setStatus: MainScreenState['setStatus'],
	viewStack: ReturnType<typeof useViewStack>
): Pick<MainScreenOverlayActions, 'openMemoryView' | 'openShortcutsView' | 'openToolsView'> {
	const { openShortcutsView } = useShortcutsOverlayAction({ busy, setStatus, viewStack })
	const { openMemoryView } = useMemoryOverlayAction({ busy, paths, setStatus, viewStack })
	const { openToolsView } = useToolsOverlayAction({ busy, setStatus, viewStack })

	return { openMemoryView, openShortcutsView, openToolsView }
}

function useMainScreenCoreActions(
	props: AppProps,
	state: MainScreenState,
	viewStackIsActive: boolean,
	toolContext: ToolExecutionContext
): ReturnType<typeof useComposerBindings> &
	ReturnType<typeof useThreadActions> &
	ReturnType<typeof useConversationDeletionActions> & { sendPrompt: ReturnType<typeof useSendPromptAction> } {
	const composerBindings = useComposerBindings({
		busy: state.busy,
		composerRef: state.composerRef,
		missingProvider: state.missingProvider,
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
		toolContext
	)

	return { ...composerBindings, ...threadActions, ...deletionActions, sendPrompt }
}

function usePaletteOverlayActions(
	state: MainScreenState,
	coreActions: MainScreenCoreActions,
	openMemoryView: () => void,
	openProviderConfig: () => void,
	openSessionsView: () => void,
	openShortcutsView: () => void,
	openToolsView: () => void,
	viewStack: ReturnType<typeof useViewStack>
): Pick<MainScreenOverlayActions, 'openCommandPalette'> {
	const commandPaletteOptions = useCommandPaletteOptions({
		createConversation: coreActions.createConversation,
		openMemoryView,
		openProviderConfig,
		openSessionsView,
		openShortcutsView,
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
	toolContext: ToolExecutionContext
): ReturnType<typeof useSendPromptAction> {
	return useSendPromptAction({
		activeThreadId: state.activeThread.conversation.id,
		applyThread,
		busy: state.busy,
		composer: state.composer,
		composerRef: state.composerRef,
		inFlightRequest: state.inFlightRequest,
		missingProvider: state.missingProvider,
		providerLabel: state.providerLabel,
		resetComposer,
		service,
		setActiveThread: state.setActiveThread,
		setActiveToolCalls: state.setActiveToolCalls,
		setBusy: state.setBusy,
		setConversations: state.setConversations,
		setError: state.setError,
		setPendingAssistantMessage: state.setPendingAssistantMessage,
		setStatus: state.setStatus,
		toolContext,
		viewStackIsActive
	})
}
