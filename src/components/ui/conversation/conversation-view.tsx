import type { ScrollBoxRenderable, TextareaRenderable } from '@opentui/core'
import { useTerminalDimensions } from '@opentui/react'
import type { ReactNode, RefObject } from 'react'

import type { InferenceToolCall, MessageRecord } from '../../../lib/types'
import { RHYTHM } from '../../../lib/ui/constants'
import { getComposerInputRows, getConversationMeasures } from '../../../lib/ui/helpers'
import { ComposerPane, TranscriptPane } from './conversation-sections'

type ConversationViewProps = {
	activeConversationId: string
	activeToolCalls: InferenceToolCall[] | null
	busy: boolean
	composer: string
	composerEpoch: number
	composerFocused: boolean
	configureComposer: (renderable: TextareaRenderable | null) => void
	messages: MessageRecord[]
	missingProvider: boolean
	model: string
	onComposerContentChange: () => void
	onComposerSubmit: () => void
	pendingAssistantMessage: MessageRecord | null
	providerLabel: string
	sessionTitle: string
	shellWidth: number
	spinner: string
	status: string
	transcriptRef: RefObject<ScrollBoxRenderable | null>
}

type ConversationLayout = {
	composerEnabled: boolean
	composerHeight: number
	composerInputRows: number
	composerSurfaceRows: number
	hasMessages: boolean
	measures: ReturnType<typeof getConversationMeasures>
	transcriptHeight: number
}

export function ConversationView(props: ConversationViewProps): ReactNode {
	const { height } = useTerminalDimensions()
	const layout = getConversationLayout(
		props.composer,
		height,
		props.messages.length,
		props.missingProvider,
		props.shellWidth
	)

	return (
		<box
			flexDirection='column'
			flexGrow={1}
			minHeight={0}
			width='100%'>
			<ConversationTranscriptSection
				layout={layout}
				props={props}
			/>
			<ConversationComposerSection
				layout={layout}
				props={props}
			/>
		</box>
	)
}

function ConversationTranscriptSection({
	layout,
	props
}: {
	layout: ConversationLayout
	props: ConversationViewProps
}): ReactNode {
	return (
		<TranscriptPane
			activeToolCalls={props.activeToolCalls}
			assistantWidth={layout.measures.assistantWidth}
			busy={props.busy}
			hasMessages={layout.hasMessages}
			messageMeasures={layout.measures}
			messages={props.messages}
			missingProvider={props.missingProvider}
			model={props.model}
			pendingAssistantMessage={props.pendingAssistantMessage}
			providerLabel={props.providerLabel}
			sessionTitle={props.sessionTitle}
			spinner={props.spinner}
			transcriptHeight={layout.transcriptHeight}
			transcriptRef={props.transcriptRef}
		/>
	)
}

function ConversationComposerSection({
	layout,
	props
}: {
	layout: ConversationLayout
	props: ConversationViewProps
}): ReactNode {
	return (
		<ComposerPane
			activeConversationId={props.activeConversationId}
			busy={props.busy}
			composer={props.composer}
			composerEnabled={layout.composerEnabled}
			composerEpoch={props.composerEpoch}
			composerFocused={props.composerFocused}
			composerHeight={layout.composerHeight}
			composerInputRows={layout.composerInputRows}
			composerSurfaceRows={layout.composerSurfaceRows}
			configureComposer={props.configureComposer}
			model={props.model}
			onComposerContentChange={props.onComposerContentChange}
			onComposerSubmit={props.onComposerSubmit}
			providerLabel={props.providerLabel}
			shellWidth={props.shellWidth}
			status={props.status}
		/>
	)
}

function getConversationLayout(
	composer: string,
	height: number,
	messageCount: number,
	missingProvider: boolean,
	shellWidth: number
): ConversationLayout {
	const hasMessages = messageCount > 0
	const composerEnabled = missingProvider === false
	const measures = getConversationMeasures(shellWidth)
	const composerInputRows = getComposerInputRows(composer, shellWidth - 7, 1, hasMessages ? 6 : 5)
	const composerSurfaceRows = composerInputRows + 3
	const composerHeight = composerSurfaceRows + RHYTHM.stack + 1
	const transcriptHeight = Math.max(8, height - composerHeight - RHYTHM.pageY - 5)

	return {
		composerEnabled,
		composerHeight,
		composerInputRows,
		composerSurfaceRows,
		hasMessages,
		measures,
		transcriptHeight
	}
}
