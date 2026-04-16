import type { ScrollBoxRenderable, TextareaRenderable } from '@opentui/core'
import type { ReactNode, RefObject } from 'react'

import type { TurnActivityState } from '../../../lib/app/main-screen-turn-activity-state'
import type { InferenceToolCall, MessageRecord, ToolCallMessageRecord } from '../../../lib/types'
import { COMPOSER_KEYBINDINGS, RHYTHM, THEME } from '../../../lib/ui/constants'
import { AppTextarea } from '../forms/controls'
import { ComposerSetupHint, ComposerSurface } from './composer'
import { ConversationEmptyState } from './message-bubble'
import { TranscriptItems } from './transcript-items'
import { TurnActivityRail } from './turn-activity-rail'

type TranscriptPaneProps = {
	activeConversationId: string
	activeToolCalls: InferenceToolCall[] | null
	assistantWidth: number | '100%'
	busy: boolean
	error: string | null
	hasMessages: boolean
	messageMeasures: { assistantWidth: number | '100%'; userWidth: number | '100%' }
	messages: MessageRecord[]
	missingMatrix: boolean
	missingProvider: boolean
	model: string
	pendingAssistantMessage: MessageRecord | null
	providerLabel: string
	sessionTitle: string
	spinnerFrameIndex: number
	toolCallMessages: ToolCallMessageRecord[]
	transcriptHeight: number
	transcriptRef: RefObject<ScrollBoxRenderable | null>
}

type ComposerPaneProps = {
	activeConversationId: string
	busy: boolean
	composer: string
	composerEnabled: boolean
	composerEpoch: number
	composerFocused: boolean
	composerHeight: number
	composerInputRows: number
	composerSurfaceRows: number
	contextUsageChars: number
	configureComposer: (renderable: TextareaRenderable | null) => void
	missingMatrix: boolean
	missingProvider: boolean
	maxTokens: number
	model: string
	onComposerContentChange: () => void
	onComposerSubmit: () => void
	promptTruncateLength: number
	providerLabel: string
	providerMode: 'custom' | 'fireworks' | null
	shellWidth: number
	spinnerFrameIndex: number
	temperature: number
	turnActivity: TurnActivityState
}

type ComposerInputAreaProps = Pick<
	ComposerPaneProps,
	| 'activeConversationId'
	| 'busy'
	| 'composer'
	| 'composerEnabled'
	| 'composerEpoch'
	| 'composerFocused'
	| 'composerInputRows'
	| 'configureComposer'
	| 'missingMatrix'
	| 'missingProvider'
	| 'onComposerContentChange'
	| 'onComposerSubmit'
>

export function TranscriptPane(props: TranscriptPaneProps): ReactNode {
	const showCenteredEmptyState = (props.missingProvider || props.missingMatrix) && !props.hasMessages

	return (
		<box
			flexShrink={0}
			height={props.transcriptHeight}>
			{showCenteredEmptyState ? (
				<CenteredEmptyState
					missingMatrix={props.missingMatrix}
					missingProvider={props.missingProvider}
					model={props.model}
					providerLabel={props.providerLabel}
					sessionTitle={props.sessionTitle}
					transcriptHeight={props.transcriptHeight}
					width={props.assistantWidth}
				/>
			) : (
				<ConversationTranscript {...props} />
			)}
		</box>
	)
}

export function ComposerPane(props: ComposerPaneProps): ReactNode {
	return (
		<box
			flexDirection='column'
			flexShrink={0}
			paddingTop={RHYTHM.stack}>
			<box
				flexDirection='column'
				height={props.composerHeight}>
				<ComposerSurface surfaceRows={props.composerSurfaceRows}>
					<ComposerInputArea {...props} />
					<TurnActivityRail
						contextUsageChars={props.contextUsageChars}
						maxTokens={props.maxTokens}
						model={props.model}
						promptTruncateLength={props.promptTruncateLength}
						providerLabel={props.providerLabel}
						providerMode={props.providerMode}
						spinnerFrameIndex={props.spinnerFrameIndex}
						temperature={props.temperature}
						turnActivity={props.turnActivity}
						width={props.shellWidth}
					/>
				</ComposerSurface>
			</box>
		</box>
	)
}

function CenteredEmptyState({
	missingMatrix,
	missingProvider,
	model,
	providerLabel,
	sessionTitle,
	transcriptHeight,
	width
}: {
	missingMatrix: boolean
	missingProvider: boolean
	model: string
	providerLabel: string
	sessionTitle: string
	transcriptHeight: number
	width: number | '100%'
}): ReactNode {
	return (
		<box
			alignItems='center'
			flexDirection='column'
			height={transcriptHeight}
			justifyContent='center'
			width='100%'>
			<ConversationEmptyState
				centered
				missingMatrix={missingMatrix}
				missingProvider={missingProvider}
				model={model}
				providerLabel={providerLabel}
				sessionTitle={sessionTitle}
				width={width}
			/>
		</box>
	)
}

function ConversationTranscript(props: TranscriptPaneProps): ReactNode {
	return (
		<scrollbox
			contentOptions={TRANSCRIPT_CONTENT_OPTIONS}
			height={props.transcriptHeight}
			ref={props.transcriptRef}
			stickyScroll
			stickyStart='bottom'
			horizontalScrollbarOptions={HIDDEN_SCROLLBAR}
			verticalScrollbarOptions={HIDDEN_SCROLLBAR}
			viewportOptions={TRANSCRIPT_VIEWPORT_OPTIONS}>
			<TranscriptItems {...props} />
		</scrollbox>
	)
}

function ComposerInputArea({
	activeConversationId,
	busy,
	composer,
	composerEnabled,
	composerEpoch,
	composerFocused,
	composerInputRows,
	configureComposer,
	missingMatrix,
	missingProvider,
	onComposerContentChange,
	onComposerSubmit
}: ComposerInputAreaProps): ReactNode {
	if (!composerEnabled) {
		return (
			<ComposerSetupHint
				height={composerInputRows}
				missingMatrix={missingMatrix}
				missingProvider={missingProvider}
			/>
		)
	}

	return (
		<AppTextarea
			focused={composerFocused && !busy}
			height={composerInputRows}
			initialValue={composer}
			keyBindings={COMPOSER_KEYBINDINGS}
			textareaKey={`composer:${activeConversationId}:${composerEpoch}`}
			onContentChange={onComposerContentChange}
			onSubmit={onComposerSubmit}
			placeholder='Ask anything...'
			textareaRef={configureComposer}
		/>
	)
}

const HIDDEN_SCROLLBAR = { visible: false } as const

const TRANSCRIPT_CONTENT_OPTIONS = {
	flexDirection: 'column',
	gap: RHYTHM.section,
	paddingBottom: RHYTHM.section,
	paddingTop: RHYTHM.stack
} as const

const TRANSCRIPT_VIEWPORT_OPTIONS = { backgroundColor: THEME.canvas } as const
