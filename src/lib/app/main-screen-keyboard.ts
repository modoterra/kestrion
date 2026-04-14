import type { MutableRefObject } from 'react'

import { useKeyboardHandler } from '../ui/keyboard'

export function useMainScreenKeyboard({
	busy,
	createConversation,
	destroyRenderer,
	inFlightRequest,
	openCommandPalette,
	openMemoryView,
	openProviderConfig,
	openSessionsView,
	openShortcutsView,
	openToolsView,
	viewStackIsActive
}: {
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
	viewStackIsActive: boolean
}): void {
	useKeyboardHandler(
		key => {
			if (handleExitKey(key, destroyRenderer, inFlightRequest)) {
				return
			}

			if (viewStackIsActive) {
				return
			}

			handleViewShortcutKey(
				key,
				busy,
				createConversation,
				openCommandPalette,
				openMemoryView,
				openProviderConfig,
				openSessionsView,
				openShortcutsView,
				openToolsView
			)
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
	createConversation: () => void,
	openCommandPalette: () => void,
	openMemoryView: () => void,
	openProviderConfig: () => void,
	openSessionsView: () => void,
	openShortcutsView: () => void,
	openToolsView: () => void
): void {
	if (key.ctrl && key.name === 'k') {
		openCommandPalette()
		return
	}

	if (key.ctrl && key.name === 'p') {
		openProviderConfig()
		return
	}

	if (key.ctrl && key.name === 'm') {
		if (!busy) {
			openMemoryView()
		}
		return
	}

	if (key.ctrl && key.name === 'n') {
		createConversation()
		return
	}

	if (key.ctrl && key.name === 'r') {
		if (!busy) {
			openSessionsView()
		}
		return
	}

	if (key.ctrl && key.name === 'g') {
		openShortcutsView()
		return
	}

	if (key.ctrl && key.name === 't') {
		openToolsView()
	}
}
