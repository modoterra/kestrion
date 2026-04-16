import { createContext, type ReactNode, useContext, useMemo } from 'react'

import type { WorkerTranscriptEntry } from '../../../lib/types'

type WorkerTranscriptContextValue = {
	activeConversationId: string
	sessionTitle: string
	workerTranscriptEntries: WorkerTranscriptEntry[]
	workerTranscriptLoading: boolean
}

const WorkerTranscriptContext = createContext<WorkerTranscriptContextValue | null>(null)

export function WorkerTranscriptProvider({
	activeConversationId,
	children,
	sessionTitle,
	workerTranscriptEntries,
	workerTranscriptLoading
}: WorkerTranscriptContextValue & { children: ReactNode }): ReactNode {
	const value = useMemo<WorkerTranscriptContextValue>(
		() => ({ activeConversationId, sessionTitle, workerTranscriptEntries, workerTranscriptLoading }),
		[activeConversationId, sessionTitle, workerTranscriptEntries, workerTranscriptLoading]
	)

	return <WorkerTranscriptContext.Provider value={value}>{children}</WorkerTranscriptContext.Provider>
}

export function useWorkerTranscriptContext(): WorkerTranscriptContextValue {
	const value = useContext(WorkerTranscriptContext)
	if (!value) {
		throw new Error('useWorkerTranscriptContext must be used within a WorkerTranscriptProvider')
	}

	return value
}
