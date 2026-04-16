import type { ScrollBoxRenderable, TextareaRenderable } from '@opentui/core'
import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'

import type { InferenceToolCall, MessageRecord, ToolCallMessageRecord } from '../types'
import { getActivityIndicatorFrameCount } from '../ui/activity-indicator'

export function useMainScreenEffects({
	activeConversationId,
	activeToolCalls,
	busy,
	composerEpoch,
	composerRef,
	deferredMessageCount,
	missingSetup,
	pendingAssistantMessage,
	setSpinnerFrameIndex,
	toolCallMessages,
	transcriptRef,
	viewStackIsActive
}: {
	activeConversationId: string
	activeToolCalls: InferenceToolCall[] | null
	busy: boolean
	composerEpoch: number
	composerRef: MutableRefObject<TextareaRenderable | null>
	deferredMessageCount: number
	missingSetup: boolean
	pendingAssistantMessage: MessageRecord | null
	setSpinnerFrameIndex: Dispatch<SetStateAction<number>>
	toolCallMessages: ToolCallMessageRecord[]
	transcriptRef: MutableRefObject<ScrollBoxRenderable | null>
	viewStackIsActive: boolean
}): void {
	useSpinnerFrameEffect(busy, setSpinnerFrameIndex)
	useComposerFocusEffect(busy, composerEpoch, composerRef, missingSetup, viewStackIsActive)
	useTranscriptScrollEffect(
		activeConversationId,
		activeToolCalls,
		busy,
		deferredMessageCount,
		pendingAssistantMessage,
		toolCallMessages,
		transcriptRef
	)
}

function useSpinnerFrameEffect(busy: boolean, setSpinnerFrameIndex: Dispatch<SetStateAction<number>>): void {
	useEffect(() => {
		if (!busy) {
			setSpinnerFrameIndex(0)
			return
		}

		const timer = setInterval(() => {
			setSpinnerFrameIndex(value => (value + 1) % getActivityIndicatorFrameCount())
		}, 120)

		return function cleanupSpinnerFrameTimer(): void {
			clearInterval(timer)
		}
	}, [busy, setSpinnerFrameIndex])
}

function useComposerFocusEffect(
	busy: boolean,
	composerEpoch: number,
	composerRef: MutableRefObject<TextareaRenderable | null>,
	missingSetup: boolean,
	viewStackIsActive: boolean
): void {
	useEffect(() => {
		if (busy || missingSetup || viewStackIsActive) {
			return
		}

		const timer = setTimeout(() => {
			const composerRenderable = composerRef.current
			if (!composerRenderable || composerRenderable.isDestroyed) {
				return
			}

			composerRenderable.focus()
		}, 1)

		return function cleanupComposerFocusTimer(): void {
			clearTimeout(timer)
		}
	}, [busy, composerEpoch, composerRef, missingSetup, viewStackIsActive])
}

function useTranscriptScrollEffect(
	activeConversationId: string,
	activeToolCalls: InferenceToolCall[] | null,
	busy: boolean,
	deferredMessageCount: number,
	pendingAssistantMessage: MessageRecord | null,
	toolCallMessages: ToolCallMessageRecord[],
	transcriptRef: MutableRefObject<ScrollBoxRenderable | null>
): void {
	useEffect(() => {
		transcriptRef.current?.scrollTo({ x: 0, y: transcriptRef.current.scrollHeight })
	}, [
		activeConversationId,
		activeToolCalls,
		busy,
		deferredMessageCount,
		pendingAssistantMessage,
		toolCallMessages,
		transcriptRef
	])
}
