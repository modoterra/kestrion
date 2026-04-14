import type { ScrollBoxRenderable, TextareaRenderable } from '@opentui/core'
import type { ReactNode, RefObject } from 'react'

import type { InferenceToolCall, MessageRecord } from '../../../lib/types'
import { COMPOSER_KEYBINDINGS, RHYTHM, THEME } from '../../../lib/ui/constants'
import { AppTextarea } from '../forms/controls'
import { ComposerModelInfo, ComposerSurface } from './composer'
import { ConversationEmptyState, MessageBubble } from './message-bubble'
import { PendingResponseState } from './pending-response-state'

type TranscriptPaneProps = {
	activeToolCalls: InferenceToolCall[] | null
	assistantWidth: number | '100%'
	busy: boolean
	hasMessages: boolean
	messageMeasures: { assistantWidth: number | '100%'; userWidth: number | '100%' }
	messages: MessageRecord[]
	missingProvider: boolean
	model: string
	pendingAssistantMessage: MessageRecord | null
	providerLabel: string
	sessionTitle: string
	spinner: string
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
	configureComposer: (renderable: TextareaRenderable | null) => void
	model: string
	onComposerContentChange: () => void
	onComposerSubmit: () => void
	providerLabel: string
	shellWidth: number
	status: string
}

export function TranscriptPane(props: TranscriptPaneProps): ReactNode {
	const showCenteredEmptyState = props.missingProvider && !props.hasMessages

	return (
		<box
			flexShrink={0}
			height={props.transcriptHeight}>
			{showCenteredEmptyState ? (
				<CenteredEmptyState
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
					<ComposerModelInfo
						busy={props.busy}
						model={props.model}
						providerLabel={props.providerLabel}
						status={props.status}
						width={props.shellWidth}
					/>
				</ComposerSurface>
			</box>
		</box>
	)
}

function CenteredEmptyState({
	missingProvider,
	model,
	providerLabel,
	sessionTitle,
	transcriptHeight,
	width
}: {
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

function TranscriptItems({
	activeToolCalls,
	assistantWidth,
	busy,
	hasMessages,
	messageMeasures,
	messages,
	missingProvider,
	model,
	pendingAssistantMessage,
	providerLabel,
	sessionTitle,
	spinner
}: Omit<TranscriptPaneProps, 'transcriptHeight' | 'transcriptRef'>): ReactNode {
	return (
		<>
			{hasMessages ? null : (
				<ConversationEmptyState
					missingProvider={missingProvider}
					model={model}
					providerLabel={providerLabel}
					sessionTitle={sessionTitle}
					width={assistantWidth}
				/>
			)}
			{messages.map(message => (
				<MessageBubble
					assistantWidth={messageMeasures.assistantWidth}
					key={message.id}
					message={message}
					userWidth={messageMeasures.userWidth}
				/>
			))}
			<PendingResponseState
				activeToolCalls={activeToolCalls}
				assistantWidth={messageMeasures.assistantWidth}
				busy={busy}
				model={model}
				pendingAssistantMessage={pendingAssistantMessage}
				providerLabel={providerLabel}
				spinner={spinner}
				width={assistantWidth}
			/>
		</>
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
	onComposerContentChange,
	onComposerSubmit
}: Pick<
	ComposerPaneProps,
	| 'activeConversationId'
	| 'busy'
	| 'composer'
	| 'composerEnabled'
	| 'composerEpoch'
	| 'composerFocused'
	| 'composerInputRows'
	| 'configureComposer'
	| 'onComposerContentChange'
	| 'onComposerSubmit'
>): ReactNode {
	if (!composerEnabled) {
		return <ComposerProviderHint height={composerInputRows} />
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

function ComposerProviderHint({ height }: { height: number }): ReactNode {
	return (
		<box
			height={height}
			justifyContent='center'
			width='100%'>
			<box
				flexDirection='row'
				gap={1}>
				<text
					fg={THEME.muted}
					selectable={false}>
					Use
				</text>
				<text
					fg={THEME.accent}
					selectable={false}>
					ctrl+p
				</text>
				<text
					fg={THEME.muted}
					selectable={false}>
					to setup a provider.
				</text>
			</box>
		</box>
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
