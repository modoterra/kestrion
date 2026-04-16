import type { ReactNode } from 'react'

import { RHYTHM, THEME } from '../../../lib/ui/constants'

const ERROR_BORDER = {
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
	vertical: '┃'
} as const

export function ErrorMessage({ assistantWidth, error }: { assistantWidth: number | '100%'; error: string }): ReactNode {
	const showMatrixHint = error.includes('MATRIX.md')

	return (
		<box
			flexDirection='row'
			justifyContent='flex-start'
			width='100%'>
			<box
				border={['left']}
				borderColor={THEME.danger}
				customBorderChars={ERROR_BORDER}
				marginRight={typeof assistantWidth === 'number' ? 6 : 0}
				width={assistantWidth}>
				<box
					backgroundColor={THEME.panelRaised}
					flexDirection='column'
					gap={RHYTHM.stack}
					paddingBottom={RHYTHM.panelY}
					paddingLeft={2}
					paddingRight={RHYTHM.panelX}
					paddingTop={RHYTHM.panelY}
					width='100%'>
					<text
						fg={THEME.danger}
						selectable={false}>
						Error
					</text>
					{getErrorLines(error).map(line => (
						<text
							fg={THEME.offWhite}
							key={line.key}
							selectable>
							{line.text}
						</text>
					))}
					{showMatrixHint ? (
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
								ctrl+k
							</text>
							<text
								fg={THEME.muted}
								selectable={false}>
								and run
							</text>
							<text
								fg={THEME.accent}
								selectable={false}>
								Setup MATRIX.md
							</text>
							<text
								fg={THEME.muted}
								selectable={false}>
								to fix it.
							</text>
						</box>
					) : null}
				</box>
			</box>
		</box>
	)
}

function getErrorLines(error: string): Array<{ key: string; text: string }> {
	let offset = 0

	return error.split(/\r?\n/).map(line => {
		const key = `error:${offset}`
		offset += line.length + 1
		return { key, text: line.length > 0 ? line : ' ' }
	})
}
