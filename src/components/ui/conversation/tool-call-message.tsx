import type { ReactNode } from 'react'

import type { ToolCallMessageRecord } from '../../../lib/types'
import { RHYTHM, THEME } from '../../../lib/ui/constants'
import { formatTime, shortenHomePath, truncate } from '../../../lib/ui/helpers'

type ToolCallMessageBubbleProps = { assistantWidth: number | '100%'; message: ToolCallMessageRecord }

export function ToolCallMessageBubble({ assistantWidth, message }: ToolCallMessageBubbleProps): ReactNode {
	const stepLabel = message.toolCalls.length === 1 ? 'tool' : 'tools'
	const statusLabel = message.status === 'running' ? `using ${stepLabel}` : `used ${stepLabel}`

	return (
		<box
			flexDirection='row'
			justifyContent='flex-start'
			width='100%'>
			<box
				marginRight={typeof assistantWidth === 'number' ? 6 : 0}
				width={assistantWidth}>
				<box
					flexDirection='column'
					gap={RHYTHM.stack}>
					<text
						fg={message.status === 'running' ? THEME.summaryAccent : THEME.muted}
						selectable={false}>
						{statusLabel}
					</text>
					{message.toolCalls.map(toolCall => (
						<ToolCallLine
							key={toolCall.id || `${toolCall.name}:${toolCall.argumentsJson}`}
							toolCall={toolCall}
						/>
					))}
					<ToolCallMetaLine message={message} />
				</box>
			</box>
		</box>
	)
}

function ToolCallMetaLine({ message }: { message: ToolCallMessageRecord }): ReactNode {
	return (
		<box
			flexDirection='row'
			gap={2}>
			<ToolCallMetaSegment
				color={THEME.softText}
				text='tool call'
			/>
			<ToolCallMetaSegment
				color={THEME.softLabel}
				text={formatTime(message.createdAt)}
			/>
			<ToolCallMetaSegment
				color={THEME.providerBlue}
				text={`${message.toolCalls.length} step${message.toolCalls.length === 1 ? '' : 's'}`}
			/>
		</box>
	)
}

function ToolCallMetaSegment({ color, text }: { color: string; text: string }): ReactNode {
	return (
		<text
			fg={color}
			selectable
			wrapMode='none'>
			{text}
		</text>
	)
}

function ToolCallLine({ toolCall }: { toolCall: ToolCallMessageRecord['toolCalls'][number] }): ReactNode {
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
				fg={THEME.offWhite}
				selectable>
				{formatToolCallPreview(toolCall.argumentsJson)}
			</text>
		</box>
	)
}

function formatToolCallPreview(argumentsJson: string): string {
	const parsed = tryParseToolArguments(argumentsJson)
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

	if (typeof parsed?.memory === 'string' && typeof parsed?.action === 'string') {
		return `${parsed.action} ${parsed.memory}`
	}

	if (typeof parsed?.action === 'string') {
		return parsed.action
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
