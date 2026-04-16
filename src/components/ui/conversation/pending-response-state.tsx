import type { ReactNode } from 'react'

import type { MessageRecord } from '../../../lib/types'
import { StreamingAssistantBubble } from './live-message-bubble'

type PendingResponseStateProps = {
	assistantWidth: number | '100%'
	pendingAssistantMessage: MessageRecord | null
	spinnerFrameIndex: number
}

export function PendingResponseState({
	assistantWidth,
	pendingAssistantMessage,
	spinnerFrameIndex
}: PendingResponseStateProps): ReactNode {
	return pendingAssistantMessage ? (
		<StreamingAssistantBubble
			assistantWidth={assistantWidth}
			message={pendingAssistantMessage}
			spinnerFrameIndex={spinnerFrameIndex}
		/>
	) : null
}
