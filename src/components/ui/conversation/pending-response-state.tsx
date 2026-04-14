import type { ReactNode } from 'react'

import type { InferenceToolCall, MessageRecord } from '../../../lib/types'
import { BusyResponseIndicator, StreamingAssistantBubble, ToolActivityBubble } from './live-message-bubble'

type PendingResponseStateProps = {
	activeToolCalls: InferenceToolCall[] | null
	assistantWidth: number | '100%'
	busy: boolean
	model: string
	pendingAssistantMessage: MessageRecord | null
	providerLabel: string
	spinner: string
	width: number | '100%'
}

export function PendingResponseState({
	activeToolCalls,
	assistantWidth,
	busy,
	model,
	pendingAssistantMessage,
	providerLabel,
	spinner,
	width
}: PendingResponseStateProps): ReactNode {
	if (pendingAssistantMessage) {
		return (
			<StreamingAssistantBubble
				assistantWidth={assistantWidth}
				message={pendingAssistantMessage}
				spinner={spinner}
			/>
		)
	}

	if (activeToolCalls) {
		return (
			<ToolActivityBubble
				assistantWidth={assistantWidth}
				spinner={spinner}
				toolCalls={activeToolCalls}
			/>
		)
	}

	return busy ? (
		<BusyResponseIndicator
			model={model}
			providerLabel={providerLabel}
			spinner={spinner}
			width={width}
		/>
	) : null
}
