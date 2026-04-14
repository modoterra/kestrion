import { type Dispatch, type ReactNode, type SetStateAction } from 'react'

import type { AppProps } from '../../../lib/app/types'
import { loadMemorySnapshot } from '../../../lib/memory-store'
import { MemoryScreen } from '../memory/screen'

type ViewStackEntry = { element: ReactNode; onPop?: () => void }
type ViewStackControls = {
	current: ViewStackEntry | null
	isActive: boolean
	pop: () => void
	push: (entry: ViewStackEntry) => void
}

export function useMemoryOverlayAction({
	busy,
	paths,
	setStatus,
	viewStack
}: {
	busy: boolean
	paths: AppProps['paths']
	setStatus: Dispatch<SetStateAction<string>>
	viewStack: ViewStackControls
}): { openMemoryView: () => void } {
	const openMemoryView = (): void => {
		if (busy || viewStack.isActive) {
			return
		}

		const snapshot = loadMemorySnapshot(paths)
		viewStack.push({ element: <MemoryScreen snapshot={snapshot} />, onPop: () => setStatus('Composer ready.') })
		setStatus('Browsing memories.')
	}

	return { openMemoryView }
}
