import type { ReactNode } from 'react'

import type { MessageRecord, ToolCallMessageRecord } from '../../../lib/types'
import { ErrorMessage } from './error-message'
import { ConversationEmptyState, MessageBubble } from './message-bubble'
import { PendingResponseState } from './pending-response-state'
import { ToolCallMessageBubble } from './tool-call-message'

type TranscriptItemsProps = {
	activeConversationId: string
	assistantWidth: number | '100%'
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
}

export function TranscriptItems({
	activeConversationId,
	assistantWidth,
	error,
	hasMessages,
	messageMeasures,
	messages,
	missingMatrix,
	missingProvider,
	model,
	pendingAssistantMessage,
	providerLabel,
	sessionTitle,
	spinnerFrameIndex,
	toolCallMessages
}: TranscriptItemsProps): ReactNode {
	return (
		<>
			<TranscriptEmptyState
				activeConversationId={activeConversationId}
				assistantWidth={assistantWidth}
				hasMessages={hasMessages}
				missingMatrix={missingMatrix}
				missingProvider={missingProvider}
				model={model}
				providerLabel={providerLabel}
				sessionTitle={sessionTitle}
				toolCallMessages={toolCallMessages}
			/>
			<TranscriptMessageList
				activeConversationId={activeConversationId}
				messageMeasures={messageMeasures}
				messages={messages}
				toolCallMessages={toolCallMessages}
			/>
			<TranscriptFeedback
				error={error}
				messageMeasures={messageMeasures}
				pendingAssistantMessage={pendingAssistantMessage}
				spinnerFrameIndex={spinnerFrameIndex}
			/>
		</>
	)
}

function TranscriptEmptyState({
	activeConversationId,
	assistantWidth,
	hasMessages,
	missingMatrix,
	missingProvider,
	model,
	providerLabel,
	sessionTitle,
	toolCallMessages
}: Pick<
	TranscriptItemsProps,
	| 'activeConversationId'
	| 'hasMessages'
	| 'missingMatrix'
	| 'missingProvider'
	| 'model'
	| 'providerLabel'
	| 'sessionTitle'
	| 'toolCallMessages'
> & { assistantWidth: number | '100%' }): ReactNode {
	if (hasMessages || hasVisibleToolCallMessages(activeConversationId, toolCallMessages)) {
		return null
	}

	return (
		<ConversationEmptyState
			missingMatrix={missingMatrix}
			missingProvider={missingProvider}
			model={model}
			providerLabel={providerLabel}
			sessionTitle={sessionTitle}
			width={assistantWidth}
		/>
	)
}

function TranscriptMessageList({
	activeConversationId,
	messageMeasures,
	messages,
	toolCallMessages
}: Pick<
	TranscriptItemsProps,
	'activeConversationId' | 'messageMeasures' | 'messages' | 'toolCallMessages'
>): ReactNode {
	const items = buildTranscriptItems(activeConversationId, messages, toolCallMessages)

	return (
		<>
			{items.map(item =>
				item.type === 'message' ? (
					<MessageBubble
						assistantWidth={messageMeasures.assistantWidth}
						key={item.message.id}
						message={item.message}
						userWidth={messageMeasures.userWidth}
					/>
				) : (
					<ToolCallMessageBubble
						assistantWidth={messageMeasures.assistantWidth}
						key={item.message.id}
						message={item.message}
					/>
				)
			)}
		</>
	)
}

function buildTranscriptItems(
	activeConversationId: string,
	messages: MessageRecord[],
	toolCallMessages: ToolCallMessageRecord[]
): Array<
	| { createdAt: string; message: MessageRecord; type: 'message' }
	| { createdAt: string; message: ToolCallMessageRecord; type: 'toolCall' }
> {
	return [
		...messages.map(message => ({ createdAt: message.createdAt, message, type: 'message' as const })),
		...toolCallMessages
			.filter(message => message.conversationId === activeConversationId)
			.map(message => ({ createdAt: message.createdAt, message, type: 'toolCall' as const }))
	].toSorted((left, right) => left.createdAt.localeCompare(right.createdAt))
}

function hasVisibleToolCallMessages(activeConversationId: string, toolCallMessages: ToolCallMessageRecord[]): boolean {
	return toolCallMessages.some(message => message.conversationId === activeConversationId)
}

function TranscriptFeedback({
	error,
	messageMeasures,
	pendingAssistantMessage,
	spinnerFrameIndex
}: Pick<
	TranscriptItemsProps,
	'error' | 'messageMeasures' | 'pendingAssistantMessage' | 'spinnerFrameIndex'
>): ReactNode {
	return (
		<>
			<PendingResponseState
				assistantWidth={messageMeasures.assistantWidth}
				pendingAssistantMessage={pendingAssistantMessage}
				spinnerFrameIndex={spinnerFrameIndex}
			/>
			{error ? (
				<ErrorMessage
					assistantWidth={messageMeasures.assistantWidth}
					error={error}
				/>
			) : null}
		</>
	)
}
