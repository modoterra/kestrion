import type { ReactNode } from 'react'

import type { MessageRecord } from '../../../lib/types'
import { RHYTHM, THEME } from '../../../lib/ui/constants'
import { compactModelName, formatTime } from '../../../lib/ui/helpers'
import { AGENT_MESSAGE_MARKDOWN_STYLE, AGENT_MESSAGE_MARKDOWN_TREE_SITTER_CLIENT } from '../../../lib/ui/markdown'

type ConversationEmptyStateProps = {
	centered?: boolean
	missingProvider: boolean
	model: string
	providerLabel: string
	sessionTitle: string
	width: number | '100%'
}

type MessageBubbleProps = { assistantWidth: number | '100%'; message: MessageRecord; userWidth: number | '100%' }

export function ConversationEmptyState(props: ConversationEmptyStateProps): ReactNode {
	const { centered = false, missingProvider, model, providerLabel, sessionTitle, width } = props
	const providerSummary = missingProvider ? null : `${providerLabel} · ${compactModelName(model)}`

	return (
		<EmptyStateFrame
			centered={centered}
			width={width}>
			<EmptyStateLead missingProvider={missingProvider} />
			{missingProvider ? <ProviderSetupHint /> : <EmptyStateSessionTitle title={sessionTitle} />}
			{providerSummary ? (
				<text
					fg={THEME.muted}
					selectable={false}>
					{providerSummary}
				</text>
			) : null}
		</EmptyStateFrame>
	)
}

export function MessageBubble({ assistantWidth, message, userWidth }: MessageBubbleProps): ReactNode {
	const isUser = message.role === 'user'
	const metaLine = buildMetaLine(message)

	if (isUser) {
		return (
			<MessageRow justifyContent='flex-end'>
				<box
					backgroundColor={THEME.userSurface}
					paddingBottom={RHYTHM.panelY}
					paddingLeft={RHYTHM.panelX}
					paddingRight={RHYTHM.panelX}
					paddingTop={RHYTHM.panelY}
					width={userWidth}>
					<MessageContent
						metaColor={THEME.muted}
						metaLine={metaLine}
						message={message}
					/>
				</box>
			</MessageRow>
		)
	}

	return (
		<MessageRow justifyContent='flex-start'>
			<box
				marginRight={typeof assistantWidth === 'number' ? 6 : 0}
				width={assistantWidth}>
				<MessageContent
					metaColor={message.role === 'assistant' ? THEME.muted : THEME.accent}
					metaLine={metaLine}
					message={message}
				/>
			</box>
		</MessageRow>
	)
}

function MessageContent({
	message,
	metaColor,
	metaLine
}: {
	message: MessageRecord
	metaColor: string
	metaLine: string
}): ReactNode {
	return (
		<box
			flexDirection='column'
			gap={RHYTHM.stack}>
			<MessageBody message={message} />
			<text
				fg={metaColor}
				selectable>
				{metaLine}
			</text>
		</box>
	)
}

function MessageBody({ message }: { message: MessageRecord }): ReactNode {
	if (message.role === 'assistant' || message.role === 'system') {
		return (
			<markdown
				conceal
				content={message.content}
				fg={THEME.offWhite}
				syntaxStyle={AGENT_MESSAGE_MARKDOWN_STYLE}
				treeSitterClient={AGENT_MESSAGE_MARKDOWN_TREE_SITTER_CLIENT}
				width='100%'
			/>
		)
	}

	return (
		<box
			flexDirection='column'
			gap={RHYTHM.stack}>
			{getMessageLines(message).map(line => (
				<text
					key={line.key}
					selectable>
					{line.text}
				</text>
			))}
		</box>
	)
}

function EmptyStateFrame({
	centered,
	children,
	width
}: {
	centered: boolean
	children: ReactNode
	width: number | '100%'
}): ReactNode {
	return (
		<box
			flexDirection='row'
			justifyContent={centered ? 'center' : 'flex-start'}
			width='100%'>
			<box
				alignItems={centered ? 'center' : undefined}
				flexDirection='column'
				gap={RHYTHM.stack}
				marginRight={typeof width === 'number' ? 6 : 0}
				width={width}>
				{children}
			</box>
		</box>
	)
}

function EmptyStateLead({ missingProvider }: { missingProvider: boolean }): ReactNode {
	if (!missingProvider) {
		return (
			<text
				fg={THEME.offWhite}
				selectable={false}>
				Start a conversation from the composer below.
			</text>
		)
	}

	return (
		<box
			alignItems='center'
			flexDirection='column'>
			<text
				fg={THEME.offWhite}
				selectable={false}>
				Configure an inference provider
			</text>
			<text
				fg={THEME.offWhite}
				selectable={false}>
				to connect to a model and start a conversation.
			</text>
		</box>
	)
}

function ProviderSetupHint(): ReactNode {
	return (
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
	)
}

function EmptyStateSessionTitle({ title }: { title: string }): ReactNode {
	return (
		<text
			fg={THEME.muted}
			selectable={false}>
			{title}
		</text>
	)
}

function MessageRow({
	children,
	justifyContent
}: {
	children: ReactNode
	justifyContent: 'flex-end' | 'flex-start'
}): ReactNode {
	return (
		<box
			flexDirection='row'
			justifyContent={justifyContent}
			width='100%'>
			{children}
		</box>
	)
}

function buildMetaLine(message: MessageRecord): string {
	const label = message.role === 'user' ? 'You' : message.role === 'assistant' ? 'Agent' : 'System'
	const parts = [label.toLowerCase(), formatTime(message.createdAt)]

	if (message.provider && message.model) {
		parts.push(compactModelName(message.model))
	}

	return parts.join(' · ')
}

function getMessageLines(message: MessageRecord): Array<{ key: string; text: string }> {
	let offset = 0

	return message.content.split(/\r?\n/).map(line => {
		const key = `${message.id}:${offset}`
		offset += line.length + 1
		return { key, text: line.length > 0 ? line : ' ' }
	})
}
