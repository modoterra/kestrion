import type { ReactNode } from 'react'

import type { InferenceToolCall, MessageRecord } from '../../../lib/types'
import { RHYTHM, THEME } from '../../../lib/ui/constants'
import { compactModelName, formatTime, shortenHomePath, renderEventMeta, truncate } from '../../../lib/ui/helpers'
import { AGENT_MESSAGE_MARKDOWN_STYLE, AGENT_MESSAGE_MARKDOWN_TREE_SITTER_CLIENT } from '../../../lib/ui/markdown'

type StreamingAssistantBubbleProps = { assistantWidth: number | '100%'; message: MessageRecord; spinner: string }
type ToolActivityBubbleProps = { assistantWidth: number | '100%'; spinner: string; toolCalls: InferenceToolCall[] }
type BusyResponseIndicatorProps = { model: string; providerLabel: string; spinner: string; width: number | '100%' }

export function StreamingAssistantBubble({
	assistantWidth,
	message,
	spinner
}: StreamingAssistantBubbleProps): ReactNode {
	return (
		<AssistantBubbleFrame assistantWidth={assistantWidth}>
			<box
				flexDirection='column'
				gap={RHYTHM.stack}>
				<MessageBody message={message} />
				<text
					fg={THEME.accent}
					selectable={false}>
					responding {spinner}
				</text>
				<text
					fg={THEME.muted}
					selectable>
					{buildMetaLine(message)}
				</text>
			</box>
		</AssistantBubbleFrame>
	)
}

export function ToolActivityBubble({ assistantWidth, spinner, toolCalls }: ToolActivityBubbleProps): ReactNode {
	const toolLabel = toolCalls.length === 1 ? 'using tool' : `using ${toolCalls.length} tools`

	return (
		<AssistantBubbleFrame assistantWidth={assistantWidth}>
			<box
				flexDirection='column'
				gap={RHYTHM.stack}>
				<text
					fg={THEME.summaryAccent}
					selectable={false}>
					{toolLabel} {spinner}
				</text>
				{toolCalls.map(toolCall => (
					<ToolActivityLine
						key={toolCall.id || `${toolCall.name}:${toolCall.argumentsJson}`}
						toolCall={toolCall}
					/>
				))}
			</box>
		</AssistantBubbleFrame>
	)
}

export function BusyResponseIndicator({ model, providerLabel, spinner, width }: BusyResponseIndicatorProps): ReactNode {
	return (
		<AssistantBubbleFrame assistantWidth={width}>
			<box
				flexDirection='column'
				gap={RHYTHM.stack}>
				<text
					fg={THEME.accent}
					selectable={false}>
					waiting for the provider response
				</text>
				<text
					fg={THEME.muted}
					selectable={false}>
					{renderEventMeta(providerLabel, model, spinner)}
				</text>
			</box>
		</AssistantBubbleFrame>
	)
}

function AssistantBubbleFrame({
	assistantWidth,
	children
}: {
	assistantWidth: number | '100%'
	children: ReactNode
}): ReactNode {
	return (
		<box
			flexDirection='row'
			justifyContent='flex-start'
			width='100%'>
			<box
				marginRight={typeof assistantWidth === 'number' ? 6 : 0}
				width={assistantWidth}>
				{children}
			</box>
		</box>
	)
}

function MessageBody({ message }: { message: MessageRecord }): ReactNode {
	if (message.role !== 'assistant' && message.role !== 'system') {
		return (
			<text
				fg={THEME.offWhite}
				selectable>
				{message.content}
			</text>
		)
	}

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

function ToolActivityLine({ toolCall }: { toolCall: InferenceToolCall }): ReactNode {
	return (
		<box
			flexDirection='row'
			gap={1}>
			<text
				fg={THEME.accent}
				selectable={false}
				wrapMode='none'>
				{toolCall.name}
			</text>
			<text
				fg={THEME.muted}
				selectable={false}>
				{formatToolCallPreview(toolCall)}
			</text>
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

function formatToolCallPreview(toolCall: InferenceToolCall): string {
	const parsed = tryParseToolArguments(toolCall.argumentsJson)
	if (typeof parsed?.path === 'string') {
		return shortenHomePath(parsed.path)
	}

	if (typeof parsed?.url === 'string') {
		return summarizeUrl(parsed.url)
	}

	if (typeof parsed?.command === 'string') {
		return truncate(parsed.command, 42)
	}

	if (typeof parsed?.pattern === 'string') {
		return truncate(parsed.pattern, 42)
	}

	if (typeof parsed?.prompt === 'string') {
		return truncate(parsed.prompt, 42)
	}

	if (typeof parsed?.query === 'string') {
		return truncate(parsed.query, 42)
	}

	return 'running...'
}

function tryParseToolArguments(value: string): Record<string, unknown> | null {
	try {
		const parsed = JSON.parse(value) as Record<string, unknown>
		return parsed && typeof parsed === 'object' ? parsed : null
	} catch {
		return null
	}
}

function summarizeUrl(value: string): string {
	try {
		const parsed = new URL(value)
		return `${parsed.hostname}${parsed.pathname === '/' ? '' : parsed.pathname}`
	} catch {
		return truncate(value, 42)
	}
}
