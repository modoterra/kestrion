import { useRenderer, useTerminalDimensions } from '@opentui/react'
import { useCallback, useRef, type ReactNode } from 'react'

import { getSpinnerFrame } from '../../../lib/app/main-screen-effects'
import { useMainScreenKeyboard } from '../../../lib/app/main-screen-keyboard'
import type { AppProps } from '../../../lib/app/types'
import { copySelectedText } from '../../../lib/clipboard'
import { MainScreenLayout } from './layout'
import { useMainScreenController, type MainScreenController } from './use-screen-controller'

export function MainScreen(props: AppProps): ReactNode {
	const renderer = useRenderer()
	const { width } = useTerminalDimensions()
	const controller = useMainScreenController(props)
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
		<MainScreenLayout
			activeConversationId={controller.activeThread.conversation.id}
			buildLabel={props.buildLabel}
			busy={controller.busy}
			composer={controller.composer}
			composerEpoch={controller.composerEpoch}
			configureComposer={controller.configureComposer}
			error={controller.error}
			fireworksModel={controller.fireworksModel}
			activeToolCalls={controller.activeToolCalls}
			messages={controller.deferredMessages}
			missingProvider={controller.missingProvider}
			onComposerContentChange={handleComposerContentChange}
			onComposerSubmit={handleComposerSubmit}
			onMouseUp={handleMouseUp}
			providerLabel={controller.providerLabel}
			pendingAssistantMessage={controller.pendingAssistantMessage}
			sessionTitle={controller.activeThread.conversation.title}
			spinner={getSpinnerFrame(controller.spinnerFrameIndex)}
			status={controller.status}
			terminalWidth={width}
			transcriptRef={controller.transcriptRef}
			viewElement={controller.viewStack.current?.element ?? null}
			viewIsActive={controller.viewStack.isActive}
		/>
	)
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
		openToolsView: controller.openToolsView,
		viewStackIsActive: controller.viewStack.isActive
	})
}
