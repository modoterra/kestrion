import type { ReactNode } from 'react'

import { RHYTHM, THEME } from '../../../lib/ui/constants'

const EMPTY_BORDER = {
	bottomLeft: '',
	bottomRight: '',
	bottomT: '',
	cross: '',
	horizontal: ' ',
	leftT: '',
	rightT: '',
	topLeft: '',
	topRight: '',
	topT: '',
	vertical: ''
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

export function ComposerSetupHint({
	height,
	missingMatrix,
	missingProvider
}: {
	height: number
	missingMatrix: boolean
	missingProvider: boolean
}): ReactNode {
	return (
		<box
			height={height}
			justifyContent='center'
			width='100%'>
			<box
				flexDirection='row'
				gap={1}>
				{missingProvider ? <ProviderSetupCopy /> : missingMatrix ? <MatrixSetupCopy /> : null}
			</box>
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

function ProviderSetupCopy(): ReactNode {
	return (
		<>
			<HintText>Use</HintText>
			<HintAccent>ctrl+p</HintAccent>
			<HintText>to setup a provider.</HintText>
		</>
	)
}

function MatrixSetupCopy(): ReactNode {
	return (
		<>
			<HintText>Use</HintText>
			<HintAccent>ctrl+k</HintAccent>
			<HintText>and run</HintText>
			<HintAccent>Setup MATRIX.md</HintAccent>
			<HintText>to enable the composer.</HintText>
		</>
	)
}

function HintAccent({ children }: { children: ReactNode }): ReactNode {
	return (
		<text
			fg={THEME.accent}
			selectable={false}>
			{children}
		</text>
	)
}

function HintText({ children }: { children: ReactNode }): ReactNode {
	return (
		<text
			fg={THEME.muted}
			selectable={false}>
			{children}
		</text>
	)
}
