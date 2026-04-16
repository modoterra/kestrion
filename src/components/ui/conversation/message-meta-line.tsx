import type { ReactNode } from 'react'

import type { MessageRecord } from '../../../lib/types'
import { THEME } from '../../../lib/ui/constants'
import { compactModelName, formatTime } from '../../../lib/ui/helpers'

export function MessageMetaLine({ message }: { message: MessageRecord }): ReactNode {
	return (
		<box
			flexDirection='row'
			gap={2}>
			<MetaSegment
				color={getRoleColor(message.role)}
				text={getRoleLabel(message.role)}
			/>
			<MetaSegment
				color={THEME.softLabel}
				text={formatTime(message.createdAt)}
			/>
			{message.provider && message.model ? (
				<MetaSegment
					color={THEME.providerBlue}
					text={compactModelName(message.model)}
				/>
			) : null}
		</box>
	)
}

function MetaSegment({ color, text }: { color: string; text: string }): ReactNode {
	return (
		<text
			fg={color}
			selectable
			wrapMode='none'>
			{text}
		</text>
	)
}

function getRoleColor(role: MessageRecord['role']): string {
	switch (role) {
		case 'assistant':
			return THEME.softText
		case 'system':
			return THEME.summaryAccent
		case 'user':
			return THEME.muted
	}
}

function getRoleLabel(role: MessageRecord['role']): string {
	switch (role) {
		case 'assistant':
			return 'agent'
		case 'system':
			return 'system'
		case 'user':
			return 'you'
	}
}
