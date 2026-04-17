/* eslint-disable max-lines-per-function */

import { useRenderer, useTerminalDimensions } from '@opentui/react'
import { useCallback, useRef, type ReactNode } from 'react'

import { useMainScreenKeyboard } from '../../../lib/app/main-screen-keyboard'
import type { AppProps } from '../../../lib/app/types'
import { copySelectedText } from '../../../lib/clipboard'
import { getPreparedInferenceUsageChars } from '../../../lib/inference/execution-profile'
import { MainScreenLayout } from './layout'
import { useMainScreenController, type MainScreenController } from './use-screen-controller'
import { WorkerTranscriptProvider } from './worker-transcript-context'

export function MainScreen(props: AppProps): ReactNode {
	const renderer = useRenderer()
	const { width } = useTerminalDimensions()
	const controller = useMainScreenController(props)
	const contextUsageChars = getConversationContextUsage(
		controller.activeThread.compaction,
		controller.activeThread.conversation,
		controller.deferredMessages,
		controller.resolvedConfig
	)
	const handleMouseUp = useStableEvent((): void => {
		void copySelectedText(renderer)
		controller.focusComposer()
	})
	const handleComposerContentChange = useStableEvent((): void => {
		controller.syncComposerFromEditor()
	})
	const handleComposerSubmit = useStableEvent((): void => {
		void controller.sendPrompt()
	})
	useScreenKeyboard(controller, props.onExit, renderer)

	return (
		<WorkerTranscriptProvider
			activeConversationId={controller.activeThread.conversation.id}
			sessionTitle={controller.activeThread.conversation.title}
			workerTranscriptEntries={controller.workerTranscriptEntries}
			workerTranscriptLoading={controller.workerTranscriptLoading}>
			<MainScreenLayout
				activeConversationId={controller.activeThread.conversation.id}
				buildLabel={props.buildLabel}
				busy={controller.busy}
				composer={controller.composer}
				composerEpoch={controller.composerEpoch}
				configureComposer={controller.configureComposer}
				contextUsageChars={contextUsageChars}
				error={controller.error}
				fireworksModel={controller.fireworksModel}
				fireworksProviderMode={controller.resolvedConfig.providers.fireworks.providerMode}
				activeToolCalls={controller.activeToolCalls}
				maxTokens={controller.resolvedConfig.providers.fireworks.maxTokens}
				messages={controller.deferredMessages}
				missingMatrix={controller.missingMatrix}
				missingProvider={controller.missingProvider}
				missingSetup={controller.missingSetup}
				onComposerContentChange={handleComposerContentChange}
				onComposerSubmit={handleComposerSubmit}
				onMouseUp={handleMouseUp}
				providerLabel={controller.providerLabel}
				pendingAssistantMessage={controller.pendingAssistantMessage}
				promptTruncateLength={controller.resolvedConfig.providers.fireworks.promptTruncateLength}
				sessionTitle={controller.activeThread.conversation.title}
				spinnerFrameIndex={controller.spinnerFrameIndex}
				status={controller.status}
				temperature={controller.resolvedConfig.providers.fireworks.temperature}
				terminalWidth={width}
				toolCallMessages={controller.toolCallMessages}
				turnActivity={controller.turnActivity}
				transcriptRef={controller.transcriptRef}
				viewElement={controller.viewStack.current?.element ?? null}
			/>
		</WorkerTranscriptProvider>
	)
}

function getConversationContextUsage(
	compaction: MainScreenController['activeThread']['compaction'],
	conversation: MainScreenController['activeThread']['conversation'],
	messages: MainScreenController['deferredMessages'],
	config: MainScreenController['resolvedConfig']
): number {
	return getPreparedInferenceUsageChars({
		compaction,
		config,
		conversation,
		messages
	})
}

function useStableEvent<TArgs extends unknown[]>(handler: (...args: TArgs) => void): (...args: TArgs) => void {
	const handlerRef = useRef(handler)
	handlerRef.current = handler

	return useCallback((...args: TArgs) => {
		handlerRef.current(...args)
	}, [])
}

function useScreenKeyboard(
	controller: MainScreenController,
	onExit: (() => void) | undefined,
	renderer: ReturnType<typeof useRenderer>
): void {
	useMainScreenKeyboard({
		busy: controller.busy,
		createConversation: controller.createConversation,
		destroyRenderer: () => {
			if (onExit) {
				onExit()
				return
			}

			renderer.destroy()
		},
		inFlightRequest: controller.inFlightRequest,
		openCommandPalette: controller.openCommandPalette,
		openMemoryView: controller.openMemoryView,
		openProviderConfig: controller.openProviderConfig,
		openSessionsView: controller.openSessionsView,
		openShortcutsView: controller.openShortcutsView,
		openTranscriptView: controller.openTranscriptView,
		openToolsView: controller.openToolsView,
		viewStackIsActive: controller.viewStack.isActive
	})
}
