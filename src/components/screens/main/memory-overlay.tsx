import { type Dispatch, type ReactNode, type SetStateAction } from 'react'

import type { AppProps } from '../../../lib/app/types'
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
	service,
	setStatus,
	viewStack
}: {
	busy: boolean
	service: AppProps['service']
	setStatus: Dispatch<SetStateAction<string>>
	viewStack: ViewStackControls
}): { openMemoryView: () => void } {
	const openMemoryView = (): void => {
		if (busy || viewStack.isActive) {
			return
		}

		void openMemoryScreen(service, setStatus, viewStack)
	}

	return { openMemoryView }
}

async function openMemoryScreen(
	service: AppProps['service'],
	setStatus: Dispatch<SetStateAction<string>>,
	viewStack: ViewStackControls
): Promise<void> {
	const snapshot = await service.loadMemorySnapshot()
	viewStack.push({ element: <MemoryScreen snapshot={snapshot} />, onPop: () => setStatus('Composer ready.') })
	setStatus('Browsing memories.')
}
