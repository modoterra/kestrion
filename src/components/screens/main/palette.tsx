import type { MutableRefObject, ReactNode } from 'react'

import { CommandPaletteScreen, type CommandPaletteOption } from '../command-palette/screen'

type ViewStackEntry = { element: ReactNode; onPop?: () => void }
type ViewStackControls = {
	current: ViewStackEntry | null
	isActive: boolean
	pop: () => void
	push: (entry: ViewStackEntry) => void
}
type CommandPaletteActions = {
	createConversation: () => void
	openProviderConfig: () => void
	openSessionsView: () => void
	openShortcutsView: () => void
	openToolsView: () => void
	reloadConversation: () => void
}

export function useCommandPaletteOverlayAction({
	busy,
	commandPaletteOptions,
	pendingPaletteActionRef,
	viewStack
}: {
	busy: boolean
	commandPaletteOptions: CommandPaletteOption[]
	pendingPaletteActionRef: MutableRefObject<(() => void) | null>
	viewStack: ViewStackControls
}): { openCommandPalette: () => void } {
	const openCommandPalette = (): void => {
		if (busy || viewStack.isActive) {
			return
		}

		viewStack.push({
			element: (
				<CommandPaletteScreen
					onSelectCommand={option => {
						pendingPaletteActionRef.current = option?.run ?? null
					}}
					options={commandPaletteOptions}
				/>
			),
			onPop: () => {
				const action = pendingPaletteActionRef.current
				pendingPaletteActionRef.current = null
				if (!action) {
					return
				}

				setTimeout(() => {
					action()
				}, 1)
			}
		})
	}

	return { openCommandPalette }
}

export function useCommandPaletteOptions({
	createConversation,
	openProviderConfig,
	openSessionsView,
	openShortcutsView,
	openToolsView,
	reloadConversation
}: CommandPaletteActions): CommandPaletteOption[] {
	return [
		createCommandPaletteOption('New session', 'Start a fresh conversation thread', 'new-session', createConversation),
		createCommandPaletteOption(
			'Browse sessions',
			'Browse and open saved sessions',
			'browse-sessions',
			openSessionsView
		),
		createCommandPaletteOption(
			'Provider settings',
			'Edit provider and model settings',
			'provider-settings',
			openProviderConfig
		),
		createCommandPaletteOption(
			'Reload conversation',
			'Reload the current conversation from storage',
			'reload-conversation',
			reloadConversation
		),
		createCommandPaletteOption('Tools', 'Browse built-in tool capabilities and schemas', 'tools', openToolsView),
		createCommandPaletteOption('Shortcuts', 'Browse available keyboard shortcuts', 'shortcuts', openShortcutsView)
	]
}

function createCommandPaletteOption(
	title: string,
	description: string,
	value: string,
	run: () => void
): CommandPaletteOption {
	return { description, run, title, value }
}
