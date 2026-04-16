import type { ScrollBoxRenderable, TextareaRenderable } from '@opentui/core'
import { useDeferredValue, useRef, type MutableRefObject } from 'react'

import { getInferenceAdapterDescriptor } from '../inference/registry'
import type { ConversationThread, WorkerTranscriptEntry } from '../types'
import { useMainScreenLocalState } from './main-screen-local-state'
import { useTurnActivityState, type TurnActivityState } from './main-screen-turn-activity-state'
import { useWorkerTranscriptState } from './main-screen-worker-transcript-state'
import type { AppProps } from './types'

type MainScreenMutableState = ReturnType<typeof useMainScreenLocalState>

export type MainScreenState = MainScreenMutableState & {
	composerRef: MutableRefObject<TextareaRenderable | null>
	deferredMessages: ConversationThread['messages']
	fireworksModel: string
	inFlightRequest: MutableRefObject<AbortController | null>
	matrixCloseStatusRef: MutableRefObject<string>
	missingMatrix: boolean
	missingProvider: boolean
	missingSetup: boolean
	pendingPaletteActionRef: MutableRefObject<(() => void) | null>
	providerCloseStatusRef: MutableRefObject<string>
	providerLabel: string
	sessionsCloseStatusRef: MutableRefObject<string>
	turnActivity: TurnActivityState
	transcriptRef: MutableRefObject<ScrollBoxRenderable | null>
	mergeWorkerTranscriptEntriesForConversation: (conversationId: string, entries: WorkerTranscriptEntry[]) => void
	workerTranscriptEntries: WorkerTranscriptEntry[]
	workerTranscriptLoading: boolean
}

type MainScreenValueArgs = MainScreenMutableState & {
	deferredMessages: ConversationThread['messages']
	mergeWorkerTranscriptEntriesForConversation: MainScreenState['mergeWorkerTranscriptEntriesForConversation']
	turnActivity: TurnActivityState
	workerTranscriptEntries: WorkerTranscriptEntry[]
	workerTranscriptLoading: boolean
}

export function useMainScreenState({
	config,
	initialConversations,
	initialThread,
	initialWritableConfig,
	service
}: Pick<
	AppProps,
	'config' | 'initialConversations' | 'initialThread' | 'initialWritableConfig' | 'service'
>): MainScreenState {
	return {
		...useMainScreenRefs(),
		...useMainScreenValues(config, initialConversations, initialThread, initialWritableConfig, service)
	}
}

function useMainScreenRefs(): Pick<
	MainScreenState,
	| 'composerRef'
	| 'inFlightRequest'
	| 'matrixCloseStatusRef'
	| 'pendingPaletteActionRef'
	| 'providerCloseStatusRef'
	| 'sessionsCloseStatusRef'
	| 'transcriptRef'
> {
	return {
		composerRef: useRef<TextareaRenderable | null>(null),
		inFlightRequest: useRef<AbortController | null>(null),
		matrixCloseStatusRef: useRef('MATRIX setup closed.'),
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
	initialWritableConfig: AppProps['initialWritableConfig'],
	service: AppProps['service']
): Omit<
	MainScreenState,
	| 'composerRef'
	| 'inFlightRequest'
	| 'matrixCloseStatusRef'
	| 'pendingPaletteActionRef'
	| 'providerCloseStatusRef'
	| 'sessionsCloseStatusRef'
	| 'transcriptRef'
> {
	const values = useMainScreenLocalState(config, initialConversations, initialThread, initialWritableConfig)
	const workerTranscriptState = useWorkerTranscriptState(values.activeThread.conversation.id, service)
	const turnActivity = useTurnActivityState({
		activeConversationId: values.activeThread.conversation.id,
		busy: values.busy,
		error: values.error,
		model: values.resolvedConfig.providers.fireworks.model,
		pendingAssistantMessage: values.pendingAssistantMessage,
		providerLabel: getInferenceAdapterDescriptor(values.resolvedConfig.defaultProvider).label
	})
	return buildDerivedMainScreenValues({
		...values,
		...workerTranscriptState,
		deferredMessages: useDeferredValue(values.activeThread.messages),
		turnActivity
	})
}

function buildDerivedMainScreenValues(
	args: MainScreenValueArgs
): Omit<
	MainScreenState,
	| 'composerRef'
	| 'inFlightRequest'
	| 'matrixCloseStatusRef'
	| 'pendingPaletteActionRef'
	| 'providerCloseStatusRef'
	| 'sessionsCloseStatusRef'
	| 'transcriptRef'
> {
	return { ...args, ...getResolvedProviderState(args.resolvedConfig) }
}

function getResolvedProviderState(
	config: AppProps['config']
): Pick<MainScreenState, 'fireworksModel' | 'missingMatrix' | 'missingProvider' | 'missingSetup' | 'providerLabel'> {
	const missingProvider = config.providers.fireworks.providerMode === null
	const missingMatrix = config.matrixPromptError !== null

	return {
		fireworksModel: config.providers.fireworks.model,
		missingMatrix,
		missingProvider,
		missingSetup: missingProvider || missingMatrix,
		providerLabel: getInferenceAdapterDescriptor(config.defaultProvider).label
	}
}
