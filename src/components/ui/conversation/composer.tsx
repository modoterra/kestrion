import type { ReactNode } from 'react'

import { RHYTHM, THEME } from '../../../lib/ui/constants'
import { compactModelName, compactProviderName, truncate } from '../../../lib/ui/helpers'

const EMPTY_BORDER = {
	topLeft: '',
	bottomLeft: '',
	vertical: '',
	topRight: '',
	bottomRight: '',
	horizontal: ' ',
	bottomT: '',
	topT: '',
	cross: '',
	leftT: '',
	rightT: ''
} as const

const SPLIT_BORDER = { ...EMPTY_BORDER, vertical: '┃' } as const

export function ComposerSurface({
	children,
	surfaceRows,
	width
}: {
	children: ReactNode
	surfaceRows: number
	width?: number | '100%'
}): ReactNode {
	return (
		<box
			flexDirection='column'
			flexShrink={0}
			width={width}>
			<box
				border={['left']}
				borderColor={THEME.accent}
				customBorderChars={{ ...SPLIT_BORDER, bottomLeft: '╹' }}
				width='100%'>
				<box
					backgroundColor={THEME.composerPanel}
					flexDirection='column'
					minHeight={surfaceRows}
					paddingLeft={2}
					paddingRight={RHYTHM.panelX}
					paddingTop={RHYTHM.panelY}
					width='100%'>
					{children}
				</box>
			</box>

			<ComposerAccentTail />
		</box>
	)
}

export function ComposerModelInfo({
	busy,
	model,
	providerLabel,
	status,
	width
}: {
	busy: boolean
	model: string
	providerLabel: string
	status: string
	width: number
}): ReactNode {
	const providerName = compactProviderName(providerLabel)
	const modelName = compactModelName(model)
	const busyStatus = busy ? truncate(status, Math.max(16, width - providerName.length - modelName.length - 8)) : null

	return (
		<box
			flexDirection='row'
			flexWrap='wrap'
			gap={1}
			paddingTop={RHYTHM.stack}>
			<text
				fg={THEME.providerBlue}
				selectable={false}>
				{providerName}
			</text>
			<text
				fg={THEME.offWhite}
				selectable={false}>
				{modelName}
			</text>
			{busyStatus ? (
				<text
					fg={THEME.muted}
					selectable={false}>
					{busyStatus}
				</text>
			) : null}
		</box>
	)
}

function ComposerAccentTail(): ReactNode {
	return (
		<box
			border={['left']}
			borderColor={THEME.accent}
			customBorderChars={{ ...EMPTY_BORDER, vertical: '╹' }}
			height={1}
			width='100%'>
			<box
				border={['bottom']}
				borderColor={THEME.composerPanel}
				customBorderChars={{ ...EMPTY_BORDER, horizontal: '▀' }}
				height={1}
				width='100%'
			/>
		</box>
	)
}
