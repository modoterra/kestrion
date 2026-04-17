import type { ScrollBoxRenderable, TextareaRenderable } from '@opentui/core'
import type { ComponentProps, ReactNode, RefObject } from 'react'

import type { TurnActivityState } from '../../../lib/app/main-screen-turn-activity-state'
import type { InferenceToolCall, MessageRecord, ToolCallMessageRecord } from '../../../lib/types'
import { THEME } from '../../../lib/ui/constants'
import { ConversationView } from '../../ui/conversation/conversation-view'
import { AppFooter } from '../../ui/layout/footer'
import { AppShellLayout } from '../../ui/layout/shell-layout'

type MainScreenLayoutProps = {
	activeConversationId: string
	activeToolCalls: InferenceToolCall[] | null
	buildLabel: string
	busy: boolean
	composer: string
	composerEpoch: number
	configureComposer: (renderable: TextareaRenderable | null) => void
	contextUsageChars: number
	error: string | null
	fireworksModel: string
	fireworksProviderMode: 'custom' | 'fireworks' | null
	maxTokens: number
	messages: MessageRecord[]
	missingMatrix: boolean
	missingProvider: boolean
	missingSetup: boolean
	onComposerContentChange: () => void
	onComposerSubmit: () => void
	onMouseUp: () => void
	pendingAssistantMessage: MessageRecord | null
	promptTruncateLength: number
	providerLabel: string
	sessionTitle: string
	spinnerFrameIndex: number
	status: string
	temperature: number
	terminalWidth: number
	toolCallMessages: ToolCallMessageRecord[]
	turnActivity: TurnActivityState
	transcriptRef: RefObject<ScrollBoxRenderable | null>
	viewElement: ReactNode | null
}

type ConversationSurfaceProps = Omit<MainScreenLayoutProps, 'buildLabel' | 'onMouseUp' | 'terminalWidth'>

export function MainScreenLayout(props: MainScreenLayoutProps): ReactNode {
	return (
		<box
			backgroundColor={THEME.canvas}
			flexDirection='column'
			height='100%'
			onMouseUp={props.onMouseUp}
			position='relative'
			width='100%'>
			<AppShellLayout
				buildLabel={props.buildLabel}
				renderFooter={shellWidth => <AppFooter width={shellWidth} />}
				renderView={shellWidth => (
					<ConversationSurface
						{...props}
						shellWidth={shellWidth}
					/>
				)}
				terminalWidth={props.terminalWidth}
			/>
		</box>
	)
}

function ConversationSurface(props: ConversationSurfaceProps & { shellWidth: number }): ReactNode {
	if (props.viewElement) {
		return props.viewElement
	}

	return <ConversationView {...buildConversationViewProps(props)} />
}

function buildConversationViewProps(
	props: Omit<ConversationSurfaceProps & { shellWidth: number }, 'viewElement'>
): ComponentProps<typeof ConversationView> {
	return {
		activeConversationId: props.activeConversationId,
		activeToolCalls: props.activeToolCalls,
		busy: props.busy,
		composer: props.composer,
		composerEpoch: props.composerEpoch,
		composerFocused: true,
		contextUsageChars: props.contextUsageChars,
		configureComposer: props.configureComposer,
		error: props.error,
		maxTokens: props.maxTokens,
		messages: props.messages,
		missingMatrix: props.missingMatrix,
		missingProvider: props.missingProvider,
		missingSetup: props.missingSetup,
		model: props.fireworksModel,
		onComposerContentChange: props.onComposerContentChange,
		onComposerSubmit: props.onComposerSubmit,
		pendingAssistantMessage: props.pendingAssistantMessage,
		promptTruncateLength: props.promptTruncateLength,
		providerLabel: props.providerLabel,
		providerMode: props.fireworksProviderMode,
		sessionTitle: props.sessionTitle,
		shellWidth: props.shellWidth,
		spinnerFrameIndex: props.spinnerFrameIndex,
		status: props.status,
		temperature: props.temperature,
		toolCallMessages: props.toolCallMessages,
		turnActivity: props.turnActivity,
		transcriptRef: props.transcriptRef
	}
}
