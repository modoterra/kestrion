/* eslint-disable max-lines-per-function */

import { useEffect, useRef, useState } from 'react'

import type { MessageRecord } from '../types'

export type LastTurnResult = 'cancelled' | 'failed' | 'none' | 'success'
export type TurnActivityPhase = 'failed' | 'idle' | 'streaming' | 'waiting'

export type TurnActivityState = {
	elapsedSeconds: number
	errorMessage: string | null
	isBusy: boolean
	lastTurnDurationSeconds: number | null
	lastTurnResult: LastTurnResult
	model: string
	phase: TurnActivityPhase
	providerLabel: string
	startedAt: number | null
}

type TurnActivityArgs = {
	activeConversationId: string
	busy: boolean
	error: string | null
	model: string
	pendingAssistantMessage: MessageRecord | null
	providerLabel: string
}

export function useTurnActivityState({
	activeConversationId,
	busy,
	error,
	model,
	pendingAssistantMessage,
	providerLabel
}: TurnActivityArgs): TurnActivityState {
	const [turnActivity, setTurnActivity] = useState<TurnActivityState>(() =>
		createIdleTurnActivity(providerLabel, model)
	)
	const previousBusy = useRef(busy)
	const previousConversationId = useRef(activeConversationId)

	useEffect(() => {
		if (!busy) {
			setTurnActivity(current => ({ ...current, model, providerLabel }))
		}
	}, [busy, model, providerLabel])

	useEffect(() => {
		if (busy && !previousBusy.current) {
			setTurnActivity({
				elapsedSeconds: 0,
				errorMessage: null,
				isBusy: true,
				lastTurnDurationSeconds: null,
				lastTurnResult: 'none',
				model,
				phase: 'waiting',
				providerLabel,
				startedAt: Date.now()
			})
		}

		if (!busy && previousBusy.current) {
			setTurnActivity(current => {
				const elapsedSeconds = getFinalElapsedDuration(current)
				return error
					? createFailedTurnActivity(providerLabel, model, error, elapsedSeconds)
					: createIdleTurnActivity(providerLabel, model, { durationSeconds: elapsedSeconds, result: 'success' })
			})
		}

		previousBusy.current = busy
	}, [busy, error, model, providerLabel])

	useEffect(() => {
		if (!busy) {
			return
		}

		setTurnActivity(current => {
			return {
				...current,
				errorMessage: null,
				isBusy: true,
				model,
				phase: pendingAssistantMessage ? 'streaming' : 'waiting',
				providerLabel,
				startedAt: current.startedAt ?? Date.now()
			}
		})
	}, [busy, model, pendingAssistantMessage, providerLabel])

	useEffect(() => {
		if (busy || !error) {
			return
		}

		setTurnActivity(current =>
			createFailedTurnActivity(providerLabel, model, error, current.lastTurnDurationSeconds ?? 0)
		)
	}, [busy, error, model, providerLabel])

	useEffect(() => {
		if (activeConversationId === previousConversationId.current) {
			return
		}

		previousConversationId.current = activeConversationId

		if (!busy) {
			setTurnActivity(createIdleTurnActivity(providerLabel, model))
		}
	}, [activeConversationId, busy, model, providerLabel])

	useEffect(() => {
		if (!turnActivity.isBusy || turnActivity.startedAt === null) {
			return
		}

		const updateElapsedTime = (): void => {
			setTurnActivity(current =>
				current.startedAt === null
					? current
					: { ...current, elapsedSeconds: Math.max(0, Math.floor((Date.now() - current.startedAt) / 1000)) }
			)
		}

		updateElapsedTime()
		const timer = setInterval(updateElapsedTime, 1000)

		return function cleanupTurnActivityTimer(): void {
			clearInterval(timer)
		}
	}, [turnActivity.isBusy, turnActivity.startedAt])

	return turnActivity
}

function createFailedTurnActivity(
	providerLabel: string,
	model: string,
	error: string,
	durationSeconds: number
): TurnActivityState {
	return {
		elapsedSeconds: durationSeconds,
		errorMessage: error,
		isBusy: false,
		lastTurnDurationSeconds: durationSeconds,
		lastTurnResult: 'failed',
		model,
		phase: 'failed',
		providerLabel,
		startedAt: null
	}
}

function createIdleTurnActivity(
	providerLabel: string,
	model: string,
	lastTurn?: { durationSeconds: number; result: Exclude<LastTurnResult, 'none'> }
): TurnActivityState {
	return {
		elapsedSeconds: 0,
		errorMessage: null,
		isBusy: false,
		lastTurnDurationSeconds: lastTurn?.durationSeconds ?? null,
		lastTurnResult: lastTurn?.result ?? 'none',
		model,
		phase: 'idle',
		providerLabel,
		startedAt: null
	}
}

function getFinalElapsedDuration(turnActivity: TurnActivityState): number {
	if (turnActivity.startedAt === null) {
		return turnActivity.elapsedSeconds
	}

	return Math.max(0, Math.floor((Date.now() - turnActivity.startedAt) / 1000))
}
