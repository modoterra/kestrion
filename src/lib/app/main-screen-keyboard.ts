import type { MutableRefObject } from 'react'

import { useKeyboardHandler } from '../ui/keyboard'

type MainScreenKeyboardArgs = {
	busy: boolean
	createConversation: () => void
	destroyRenderer: () => void
	inFlightRequest: MutableRefObject<AbortController | null>
	openCommandPalette: () => void
	openMemoryView: () => void
	openProviderConfig: () => void
	openSessionsView: () => void
	openShortcutsView: () => void
	openToolsView: () => void
	openTranscriptView: () => void
	viewStackIsActive: boolean
}

type MainScreenShortcutActions = Omit<
	MainScreenKeyboardArgs,
	'destroyRenderer' | 'inFlightRequest' | 'viewStackIsActive'
>

export function useMainScreenKeyboard(args: MainScreenKeyboardArgs): void {
	useKeyboardHandler(
		key => {
			if (handleExitKey(key, args.destroyRenderer, args.inFlightRequest) || args.viewStackIsActive) {
				return
			}

			handleViewShortcutKey(key, args.busy, args)
		},
		{ priority: 0 }
	)
}

function handleExitKey(
	key: { ctrl?: boolean; name: string },
	destroyRenderer: () => void,
	inFlightRequest: MutableRefObject<AbortController | null>
): boolean {
	if ((key.ctrl && key.name === 'c') || key.name === 'escape') {
		inFlightRequest.current?.abort()
		destroyRenderer()
		return true
	}

	return false
}

function handleViewShortcutKey(
	key: { ctrl?: boolean; name: string },
	busy: boolean,
	actions: MainScreenShortcutActions
): void {
	if (!key.ctrl) {
		return
	}

	switch (key.name) {
		case 'g':
			actions.openShortcutsView()
			return
		case 'k':
			actions.openCommandPalette()
			return
		case 'm':
			if (!busy) {
				actions.openMemoryView()
			}
			return
		case 'n':
			actions.createConversation()
			return
		case 'p':
			actions.openProviderConfig()
			return
		case 'r':
			if (!busy) {
				actions.openSessionsView()
			}
			return
		case 't':
			actions.openToolsView()
			return
		case 'y':
			actions.openTranscriptView()
			return
		default:
			break
	}
}
