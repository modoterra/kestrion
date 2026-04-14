import type { ScrollBoxRenderable, TextareaRenderable } from '@opentui/core'
import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'

import type { InferenceToolCall, MessageRecord } from '../types'

const SPINNER_FRAMES = ['o..', '.o.', '..o']

export function useMainScreenEffects({
	activeConversationId,
	activeToolCalls,
	busy,
	composerEpoch,
	composerRef,
	deferredMessageCount,
	missingProvider,
	pendingAssistantMessage,
	setSpinnerFrameIndex,
	transcriptRef,
	viewStackIsActive
}: {
	activeConversationId: string
	activeToolCalls: InferenceToolCall[] | null
	busy: boolean
	composerEpoch: number
	composerRef: MutableRefObject<TextareaRenderable | null>
	deferredMessageCount: number
	missingProvider: boolean
	pendingAssistantMessage: MessageRecord | null
	setSpinnerFrameIndex: Dispatch<SetStateAction<number>>
	transcriptRef: MutableRefObject<ScrollBoxRenderable | null>
	viewStackIsActive: boolean
}): void {
	useSpinnerFrameEffect(busy, setSpinnerFrameIndex)
	useComposerFocusEffect(busy, composerEpoch, composerRef, missingProvider, viewStackIsActive)
	useTranscriptScrollEffect(
		activeConversationId,
		activeToolCalls,
		busy,
		deferredMessageCount,
		pendingAssistantMessage,
		transcriptRef
	)
}

export function getSpinnerFrame(spinnerFrameIndex: number): string {
	return SPINNER_FRAMES[spinnerFrameIndex] ?? SPINNER_FRAMES[0] ?? 'o..'
}

function useSpinnerFrameEffect(busy: boolean, setSpinnerFrameIndex: Dispatch<SetStateAction<number>>): void {
	useEffect(() => {
		if (!busy) {
			setSpinnerFrameIndex(0)
			return
		}

		const timer = setInterval(() => {
			setSpinnerFrameIndex(value => (value + 1) % SPINNER_FRAMES.length)
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
	missingProvider: boolean,
	viewStackIsActive: boolean
): void {
	useEffect(() => {
		if (busy || missingProvider || viewStackIsActive) {
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
	}, [busy, composerEpoch, composerRef, missingProvider, viewStackIsActive])
}

function useTranscriptScrollEffect(
	activeConversationId: string,
	activeToolCalls: InferenceToolCall[] | null,
	busy: boolean,
	deferredMessageCount: number,
	pendingAssistantMessage: MessageRecord | null,
	transcriptRef: MutableRefObject<ScrollBoxRenderable | null>
): void {
	useEffect(() => {
		transcriptRef.current?.scrollTo({ x: 0, y: transcriptRef.current.scrollHeight })
	}, [activeConversationId, activeToolCalls, busy, deferredMessageCount, pendingAssistantMessage, transcriptRef])
}
