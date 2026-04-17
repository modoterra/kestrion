import type { ScrollBoxRenderable, TextareaRenderable } from '@opentui/core'
import { useTerminalDimensions } from '@opentui/react'
import type { ReactNode, RefObject } from 'react'

import type { TurnActivityState } from '../../../lib/app/main-screen-turn-activity-state'
import type { InferenceToolCall, MessageRecord, ToolCallMessageRecord } from '../../../lib/types'
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
	contextUsageChars: number
	configureComposer: (renderable: TextareaRenderable | null) => void
	error: string | null
	maxTokens: number
	messages: MessageRecord[]
	missingMatrix: boolean
	missingProvider: boolean
	missingSetup: boolean
	model: string
	onComposerContentChange: () => void
	onComposerSubmit: () => void
	pendingAssistantMessage: MessageRecord | null
	promptTruncateLength: number
	providerLabel: string
	providerMode: 'custom' | 'fireworks' | null
	sessionTitle: string
	shellWidth: number
	spinnerFrameIndex: number
	status: string
	temperature: number
	toolCallMessages: ToolCallMessageRecord[]
	turnActivity: TurnActivityState
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
		props.missingSetup,
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
			activeConversationId={props.activeConversationId}
			activeToolCalls={props.activeToolCalls}
			assistantWidth={layout.measures.assistantWidth}
			busy={props.busy}
			error={props.error}
			hasMessages={layout.hasMessages}
			messageMeasures={layout.measures}
			messages={props.messages}
			missingMatrix={props.missingMatrix}
			missingProvider={props.missingProvider}
			model={props.model}
			pendingAssistantMessage={props.pendingAssistantMessage}
			providerLabel={props.providerLabel}
			sessionTitle={props.sessionTitle}
			spinnerFrameIndex={props.spinnerFrameIndex}
			toolCallMessages={props.toolCallMessages}
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
			contextUsageChars={props.contextUsageChars}
			configureComposer={props.configureComposer}
			missingMatrix={props.missingMatrix}
			missingProvider={props.missingProvider}
			maxTokens={props.maxTokens}
			model={props.model}
			onComposerContentChange={props.onComposerContentChange}
			onComposerSubmit={props.onComposerSubmit}
			promptTruncateLength={props.promptTruncateLength}
			providerLabel={props.providerLabel}
			providerMode={props.providerMode}
			shellWidth={props.shellWidth}
			spinnerFrameIndex={props.spinnerFrameIndex}
			status={props.status}
			temperature={props.temperature}
			turnActivity={props.turnActivity}
		/>
	)
}

function getConversationLayout(
	composer: string,
	height: number,
	messageCount: number,
	missingSetup: boolean,
	shellWidth: number
): ConversationLayout {
	const hasMessages = messageCount > 0
	const composerEnabled = missingSetup === false
	const measures = getConversationMeasures(shellWidth)
	const composerInputRows = getComposerInputRows(composer, shellWidth - 7, 1, hasMessages ? 6 : 5)
	const turnRailRows = 2
	const composerSurfaceHeight = composerInputRows + turnRailRows
	const composerHeight = composerSurfaceHeight + RHYTHM.stack + 1
	const transcriptHeight = Math.max(8, height - composerHeight - RHYTHM.pageY - 5)

	return {
		composerEnabled,
		composerHeight,
		composerInputRows,
		composerSurfaceRows: composerSurfaceHeight,
		hasMessages,
		measures,
		transcriptHeight
	}
}
