import type { ScrollBoxRenderable, TextareaRenderable } from '@opentui/core'
import type { ReactNode, RefObject } from 'react'

import type { InferenceToolCall, MessageRecord } from '../../../lib/types'
import { THEME } from '../../../lib/ui/constants'
import { ConversationView } from '../../ui/conversation/conversation-view'
import { FloatingNotice } from '../../ui/feedback/floating-notice'
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
	error: string | null
	fireworksModel: string
	messages: MessageRecord[]
	missingProvider: boolean
	onComposerContentChange: () => void
	onComposerSubmit: () => void
	onMouseUp: () => void
	pendingAssistantMessage: MessageRecord | null
	providerLabel: string
	sessionTitle: string
	spinner: string
	status: string
	terminalWidth: number
	transcriptRef: RefObject<ScrollBoxRenderable | null>
	viewElement: ReactNode | null
	viewIsActive: boolean
}

type ConversationSurfaceProps = Omit<
	MainScreenLayoutProps,
	'buildLabel' | 'error' | 'onMouseUp' | 'terminalWidth' | 'viewIsActive'
>

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
			<ErrorNotice
				error={props.error}
				viewIsActive={props.viewIsActive}
			/>
		</box>
	)
}

function ConversationSurface({
	activeConversationId,
	busy,
	composer,
	composerEpoch,
	configureComposer,
	fireworksModel,
	messages,
	missingProvider,
	onComposerContentChange,
	onComposerSubmit,
	pendingAssistantMessage,
	providerLabel,
	sessionTitle,
	shellWidth,
	spinner,
	status,
	activeToolCalls,
	transcriptRef,
	viewElement
}: ConversationSurfaceProps & { shellWidth: number }): ReactNode {
	return (
		viewElement ?? (
			<ConversationView
				activeConversationId={activeConversationId}
				busy={busy}
				composer={composer}
				composerEpoch={composerEpoch}
				composerFocused
				configureComposer={configureComposer}
				messages={messages}
				missingProvider={missingProvider}
				model={fireworksModel}
				onComposerContentChange={onComposerContentChange}
				onComposerSubmit={onComposerSubmit}
				pendingAssistantMessage={pendingAssistantMessage}
				providerLabel={providerLabel}
				sessionTitle={sessionTitle}
				shellWidth={shellWidth}
				spinner={spinner}
				status={status}
				activeToolCalls={activeToolCalls}
				transcriptRef={transcriptRef}
			/>
		)
	)
}

function ErrorNotice({ error, viewIsActive }: { error: string | null; viewIsActive: boolean }): ReactNode {
	return error ? (
		<FloatingNotice
			backgroundColor={THEME.panel}
			bottom={viewIsActive ? 3 : 7}
			left={2}
			right={2}
			zIndex={40}>
			<text
				fg={THEME.danger}
				selectable={false}>
				{error}
			</text>
		</FloatingNotice>
	) : null
}
