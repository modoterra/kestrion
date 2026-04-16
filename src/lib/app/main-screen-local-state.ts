import { useState, type Dispatch, type SetStateAction } from 'react'

import type {
	ConversationSummary,
	ConversationThread,
	InferenceToolCall,
	MessageRecord,
	ToolCallMessageRecord
} from '../types'
import { useToolCallMessagesState } from './main-screen-tool-call-state'
import { buildReadyStatus } from './status'
import type { AppProps } from './types'

export type MainScreenLocalState = {
	activeThread: ConversationThread
	activeToolCalls: InferenceToolCall[] | null
	busy: boolean
	composer: string
	composerEpoch: number
	conversations: ConversationSummary[]
	error: string | null
	pendingAssistantMessage: MessageRecord | null
	resolvedConfig: AppProps['config']
	setToolCallMessages: Dispatch<SetStateAction<ToolCallMessageRecord[]>>
	setActiveThread: Dispatch<SetStateAction<ConversationThread>>
	setActiveToolCalls: Dispatch<SetStateAction<InferenceToolCall[] | null>>
	setBusy: Dispatch<SetStateAction<boolean>>
	setComposer: Dispatch<SetStateAction<string>>
	setComposerEpoch: Dispatch<SetStateAction<number>>
	setConversations: Dispatch<SetStateAction<ConversationSummary[]>>
	setError: Dispatch<SetStateAction<string | null>>
	setPendingAssistantMessage: Dispatch<SetStateAction<MessageRecord | null>>
	setResolvedConfig: Dispatch<SetStateAction<AppProps['config']>>
	setSpinnerFrameIndex: Dispatch<SetStateAction<number>>
	setStatus: Dispatch<SetStateAction<string>>
	setWritableConfig: Dispatch<SetStateAction<AppProps['initialWritableConfig']>>
	spinnerFrameIndex: number
	status: string
	toolCallMessages: ToolCallMessageRecord[]
	writableConfig: AppProps['initialWritableConfig']
}

export function useMainScreenLocalState(
	config: AppProps['config'],
	initialConversations: AppProps['initialConversations'],
	initialThread: AppProps['initialThread'],
	initialWritableConfig: AppProps['initialWritableConfig']
): MainScreenLocalState {
	const [resolvedConfig, setResolvedConfig] = useState(config)
	const [writableConfig, setWritableConfig] = useState(initialWritableConfig)
	const [activeThread, setActiveThread] = useState(initialThread)
	const [conversations, setConversations] = useState(initialConversations)
	const [composer, setComposer] = useState('')
	const [composerEpoch, setComposerEpoch] = useState(0)
	const [pendingAssistantMessage, setPendingAssistantMessage] = useState<MessageRecord | null>(null)
	const [toolCallMessages, setToolCallMessages] = useToolCallMessagesState(initialThread, activeThread)
	const [activeToolCalls, setActiveToolCalls] = useState<InferenceToolCall[] | null>(null)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [status, setStatus] = useState(buildReadyStatus(config))
	const [spinnerFrameIndex, setSpinnerFrameIndex] = useState(0)

	return {
		activeThread,
		activeToolCalls,
		busy,
		composer,
		composerEpoch,
		conversations,
		error,
		pendingAssistantMessage,
		resolvedConfig,
		setToolCallMessages,
		setActiveThread,
		setActiveToolCalls,
		setBusy,
		setComposer,
		setComposerEpoch,
		setConversations,
		setError,
		setPendingAssistantMessage,
		setResolvedConfig,
		setSpinnerFrameIndex,
		setStatus,
		setWritableConfig,
		spinnerFrameIndex,
		status,
		toolCallMessages,
		writableConfig
	}
}
