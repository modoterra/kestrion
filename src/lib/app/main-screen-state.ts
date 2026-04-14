import type { ScrollBoxRenderable, TextareaRenderable } from '@opentui/core'
import { useDeferredValue, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'

import { getInferenceAdapterDescriptor } from '../inference/registry'
import type { ConversationSummary, ConversationThread, InferenceToolCall, MessageRecord } from '../types'
import { buildReadyStatus } from './status'
import type { AppProps } from './types'

export type MainScreenState = {
	activeThread: ConversationThread
	activeToolCalls: InferenceToolCall[] | null
	busy: boolean
	composer: string
	composerEpoch: number
	composerRef: MutableRefObject<TextareaRenderable | null>
	conversations: ConversationSummary[]
	deferredMessages: ConversationThread['messages']
	error: string | null
	fireworksModel: string
	inFlightRequest: MutableRefObject<AbortController | null>
	missingProvider: boolean
	pendingPaletteActionRef: MutableRefObject<(() => void) | null>
	pendingAssistantMessage: MessageRecord | null
	providerCloseStatusRef: MutableRefObject<string>
	providerLabel: string
	resolvedConfig: AppProps['config']
	sessionsCloseStatusRef: MutableRefObject<string>
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
	transcriptRef: MutableRefObject<ScrollBoxRenderable | null>
	writableConfig: AppProps['initialWritableConfig']
}

type MainScreenValueArgs = {
	activeThread: AppProps['initialThread']
	activeToolCalls: InferenceToolCall[] | null
	busy: boolean
	composer: string
	composerEpoch: number
	conversations: AppProps['initialConversations']
	deferredMessages: AppProps['initialThread']['messages']
	error: string | null
	pendingAssistantMessage: MessageRecord | null
	resolvedConfig: AppProps['config']
	setActiveThread: MainScreenState['setActiveThread']
	setActiveToolCalls: MainScreenState['setActiveToolCalls']
	setBusy: MainScreenState['setBusy']
	setComposer: MainScreenState['setComposer']
	setComposerEpoch: MainScreenState['setComposerEpoch']
	setConversations: MainScreenState['setConversations']
	setError: MainScreenState['setError']
	setPendingAssistantMessage: MainScreenState['setPendingAssistantMessage']
	setResolvedConfig: MainScreenState['setResolvedConfig']
	setSpinnerFrameIndex: MainScreenState['setSpinnerFrameIndex']
	setStatus: MainScreenState['setStatus']
	setWritableConfig: MainScreenState['setWritableConfig']
	spinnerFrameIndex: number
	status: string
	writableConfig: AppProps['initialWritableConfig']
}

export function useMainScreenState({
	config,
	initialConversations,
	initialThread,
	initialWritableConfig
}: Pick<AppProps, 'config' | 'initialConversations' | 'initialThread' | 'initialWritableConfig'>): MainScreenState {
	return {
		...useMainScreenRefs(),
		...useMainScreenValues(config, initialConversations, initialThread, initialWritableConfig)
	}
}

function useMainScreenRefs(): Pick<
	MainScreenState,
	| 'composerRef'
	| 'inFlightRequest'
	| 'pendingPaletteActionRef'
	| 'providerCloseStatusRef'
	| 'sessionsCloseStatusRef'
	| 'transcriptRef'
> {
	return {
		composerRef: useRef<TextareaRenderable | null>(null),
		inFlightRequest: useRef<AbortController | null>(null),
		pendingPaletteActionRef: useRef<(() => void) | null>(null),
		providerCloseStatusRef: useRef('Provider editor closed.'),
		sessionsCloseStatusRef: useRef('Composer ready.'),
		transcriptRef: useRef<ScrollBoxRenderable | null>(null)
	}
}

function useMainScreenValues(
	config: AppProps['config'],
	initialConversations: AppProps['initialConversations'],
	initialThread: AppProps['initialThread'],
	initialWritableConfig: AppProps['initialWritableConfig']
): Omit<
	MainScreenState,
	| 'composerRef'
	| 'inFlightRequest'
	| 'pendingPaletteActionRef'
	| 'providerCloseStatusRef'
	| 'sessionsCloseStatusRef'
	| 'transcriptRef'
> {
	const values = useMainScreenStateValues(config, initialConversations, initialThread, initialWritableConfig)
	return buildDerivedMainScreenValues({ ...values, deferredMessages: useDeferredValue(values.activeThread.messages) })
}

function useMainScreenStateValues(
	config: AppProps['config'],
	initialConversations: AppProps['initialConversations'],
	initialThread: AppProps['initialThread'],
	initialWritableConfig: AppProps['initialWritableConfig']
): Omit<MainScreenValueArgs, 'deferredMessages'> {
	const [resolvedConfig, setResolvedConfig] = useState(config)
	const [writableConfig, setWritableConfig] = useState(initialWritableConfig)
	const [activeThread, setActiveThread] = useState(initialThread)
	const [conversations, setConversations] = useState(initialConversations)
	const [composer, setComposer] = useState('')
	const [composerEpoch, setComposerEpoch] = useState(0)
	const [pendingAssistantMessage, setPendingAssistantMessage] = useState<MessageRecord | null>(null)
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
		writableConfig
	}
}

function buildDerivedMainScreenValues(
	args: MainScreenValueArgs
): Omit<
	MainScreenState,
	| 'composerRef'
	| 'inFlightRequest'
	| 'pendingPaletteActionRef'
	| 'providerCloseStatusRef'
	| 'sessionsCloseStatusRef'
	| 'transcriptRef'
> {
	return {
		activeThread: args.activeThread,
		activeToolCalls: args.activeToolCalls,
		busy: args.busy,
		composer: args.composer,
		composerEpoch: args.composerEpoch,
		conversations: args.conversations,
		deferredMessages: args.deferredMessages,
		error: args.error,
		...getResolvedProviderState(args.resolvedConfig),
		pendingAssistantMessage: args.pendingAssistantMessage,
		resolvedConfig: args.resolvedConfig,
		...getMainScreenValueSetters(
			args.setActiveThread,
			args.setActiveToolCalls,
			args.setBusy,
			args.setComposer,
			args.setComposerEpoch,
			args.setConversations,
			args.setError,
			args.setPendingAssistantMessage,
			args.setResolvedConfig,
			args.setSpinnerFrameIndex,
			args.setStatus,
			args.setWritableConfig
		),
		spinnerFrameIndex: args.spinnerFrameIndex,
		status: args.status,
		writableConfig: args.writableConfig
	}
}

function getResolvedProviderState(
	config: AppProps['config']
): Pick<MainScreenState, 'fireworksModel' | 'missingProvider' | 'providerLabel'> {
	return {
		fireworksModel: config.providers.fireworks.model,
		missingProvider: config.providers.fireworks.providerMode === null,
		providerLabel: getInferenceAdapterDescriptor(config.defaultProvider).label
	}
}

function getMainScreenValueSetters(
	setActiveThread: MainScreenState['setActiveThread'],
	setActiveToolCalls: MainScreenState['setActiveToolCalls'],
	setBusy: MainScreenState['setBusy'],
	setComposer: MainScreenState['setComposer'],
	setComposerEpoch: MainScreenState['setComposerEpoch'],
	setConversations: MainScreenState['setConversations'],
	setError: MainScreenState['setError'],
	setPendingAssistantMessage: MainScreenState['setPendingAssistantMessage'],
	setResolvedConfig: MainScreenState['setResolvedConfig'],
	setSpinnerFrameIndex: MainScreenState['setSpinnerFrameIndex'],
	setStatus: MainScreenState['setStatus'],
	setWritableConfig: MainScreenState['setWritableConfig']
): Pick<
	MainScreenState,
	| 'setActiveThread'
	| 'setActiveToolCalls'
	| 'setBusy'
	| 'setComposer'
	| 'setComposerEpoch'
	| 'setConversations'
	| 'setError'
	| 'setPendingAssistantMessage'
	| 'setResolvedConfig'
	| 'setSpinnerFrameIndex'
	| 'setStatus'
	| 'setWritableConfig'
> {
	return {
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
		setWritableConfig
	}
}
