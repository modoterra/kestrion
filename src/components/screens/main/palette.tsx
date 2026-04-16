import type { MutableRefObject, ReactNode } from 'react'

import { CommandPaletteScreen, type CommandPaletteOption } from '../command-palette/screen'

export { useMemoryOverlayAction } from './memory-overlay'

type ViewStackEntry = { element: ReactNode; onPop?: () => void }
type ViewStackControls = {
	current: ViewStackEntry | null
	isActive: boolean
	pop: () => void
	push: (entry: ViewStackEntry) => void
}
type CommandPaletteActions = {
	createConversation: () => void
	openMemoryView: () => void
	openMatrixSetup: () => void
	openProviderConfig: () => void
	openSessionsView: () => void
	openShortcutsView: () => void
	openTranscriptView: () => void
	openToolsView: () => void
	reloadConversation: () => Promise<void>
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
					void action()
				}, 1)
			}
		})
	}

	return { openCommandPalette }
}

export function useCommandPaletteOptions({
	createConversation,
	openMemoryView,
	openMatrixSetup,
	openProviderConfig,
	openSessionsView,
	openShortcutsView,
	openTranscriptView,
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
		createCommandPaletteOption('Memory', 'Browse scratch, episodic, and long-term memory', 'memory', openMemoryView),
		createCommandPaletteOption(
			'Setup MATRIX.md',
			'Create or rebuild the shared agent behavior prompt',
			'setup-matrix',
			openMatrixSetup
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
		createCommandPaletteOption(
			'Transcript',
			'Browse daemon and worker wire traffic for the active conversation',
			'transcript',
			openTranscriptView
		),
		createCommandPaletteOption('Tools', 'Browse built-in tool capabilities and schemas', 'tools', openToolsView),
		createCommandPaletteOption('Shortcuts', 'Browse available keyboard shortcuts', 'shortcuts', openShortcutsView)
	]
}

function createCommandPaletteOption(
	title: string,
	description: string,
	value: string,
	run: () => void | Promise<void>
): CommandPaletteOption {
	return { description, run, title, value }
}
