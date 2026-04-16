import { type Dispatch, type ReactNode, type SetStateAction } from 'react'

import { TranscriptScreen } from '../transcript/screen'

type ViewStackEntry = { element: ReactNode; onPop?: () => void }
type ViewStackControls = {
	current: ViewStackEntry | null
	isActive: boolean
	pop: () => void
	push: (entry: ViewStackEntry) => void
}

export function useTranscriptOverlayAction({
	busy,
	setStatus,
	viewStack
}: {
	busy: boolean
	setStatus: Dispatch<SetStateAction<string>>
	viewStack: ViewStackControls
}): { openTranscriptView: () => void } {
	const openTranscriptView = (): void => {
		if (viewStack.isActive) {
			return
		}

		viewStack.push({
			element: <TranscriptScreen />,
			onPop: () => {
				if (!busy) {
					setStatus('Composer ready.')
				}
			}
		})

		if (!busy) {
			setStatus('Browsing transcript.')
		}
	}

	return { openTranscriptView }
}
