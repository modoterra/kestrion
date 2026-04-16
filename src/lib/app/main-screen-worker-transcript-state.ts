import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'

import { isDraftConversationId } from '../services/agent-service'
import type { AppService } from '../services/app-service'
import type { WorkerTranscriptEntry } from '../types'
import { mergeWorkerTranscriptEntries } from '../worker-transcript'

type WorkerTranscriptState = {
	loadingConversationId: string | null
	workerTranscriptByConversation: Record<string, WorkerTranscriptEntry[]>
}

type WorkerTranscriptHookValue = {
	mergeWorkerTranscriptEntriesForConversation: (conversationId: string, entries: WorkerTranscriptEntry[]) => void
	workerTranscriptEntries: WorkerTranscriptEntry[]
	workerTranscriptLoading: boolean
}

export function useWorkerTranscriptState(activeConversationId: string, service: AppService): WorkerTranscriptHookValue {
	const [state, setState] = useState(() => createInitialWorkerTranscriptState(activeConversationId))
	const mergeWorkerTranscriptEntriesForConversation = useConversationTranscriptMerge(setState)

	useConversationTranscriptLoader(
		activeConversationId,
		service,
		state,
		setState,
		mergeWorkerTranscriptEntriesForConversation
	)

	return {
		mergeWorkerTranscriptEntriesForConversation,
		workerTranscriptEntries: state.workerTranscriptByConversation[activeConversationId] ?? [],
		workerTranscriptLoading:
			isDraftConversationId(activeConversationId) === false && state.loadingConversationId === activeConversationId
	}
}

function createInitialWorkerTranscriptState(activeConversationId: string): WorkerTranscriptState {
	return {
		loadingConversationId: isDraftConversationId(activeConversationId) ? null : activeConversationId,
		workerTranscriptByConversation: {}
	}
}

function useConversationTranscriptMerge(
	setState: Dispatch<SetStateAction<WorkerTranscriptState>>
): WorkerTranscriptHookValue['mergeWorkerTranscriptEntriesForConversation'] {
	return useCallback(
		(conversationId: string, entries: WorkerTranscriptEntry[]): void => {
			if (entries.length === 0) {
				return
			}

			setState(current => ({
				loadingConversationId: current.loadingConversationId === conversationId ? null : current.loadingConversationId,
				workerTranscriptByConversation: {
					...current.workerTranscriptByConversation,
					[conversationId]: mergeWorkerTranscriptEntries(
						current.workerTranscriptByConversation[conversationId] ?? [],
						entries
					)
				}
			}))
		},
		[setState]
	)
}

function useConversationTranscriptLoader(
	activeConversationId: string,
	service: AppService,
	state: WorkerTranscriptState,
	setState: Dispatch<SetStateAction<WorkerTranscriptState>>,
	mergeWorkerTranscriptEntriesForConversation: WorkerTranscriptHookValue['mergeWorkerTranscriptEntriesForConversation']
): void {
	useEffect(() => {
		if (isDraftConversationId(activeConversationId)) {
			clearLoadingConversation(activeConversationId, setState)
			return
		}

		if (state.workerTranscriptByConversation[activeConversationId]) {
			clearLoadingConversation(activeConversationId, setState)
			return
		}

		let cancelled = false
		markConversationLoading(activeConversationId, setState)
		void service
			.loadConversationWorkerTranscript(activeConversationId)
			.then(entries => {
				if (cancelled) {
					return null
				}

				mergeWorkerTranscriptEntriesForConversation(activeConversationId, entries)
				clearLoadingConversation(activeConversationId, setState)
				return null
			})
			.catch(() => {
				if (!cancelled) {
					clearLoadingConversation(activeConversationId, setState)
				}

				return null
			})

		return (): void => {
			cancelled = true
		}
	}, [
		activeConversationId,
		mergeWorkerTranscriptEntriesForConversation,
		service,
		setState,
		state.workerTranscriptByConversation
	])
}

function clearLoadingConversation(
	conversationId: string,
	setState: Dispatch<SetStateAction<WorkerTranscriptState>>
): void {
	if (isDraftConversationId(conversationId)) {
		setState(current =>
			current.loadingConversationId === null ? current : { ...current, loadingConversationId: null }
		)
		return
	}

	setState(current =>
		current.loadingConversationId === conversationId ? { ...current, loadingConversationId: null } : current
	)
}

function markConversationLoading(
	conversationId: string,
	setState: Dispatch<SetStateAction<WorkerTranscriptState>>
): void {
	setState(current =>
		current.loadingConversationId === conversationId ? current : { ...current, loadingConversationId: conversationId }
	)
}
