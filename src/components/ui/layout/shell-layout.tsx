import type { ReactNode } from 'react'

import { RHYTHM } from '../../../lib/ui/constants'
import { AppHeader } from './app-header'

type ShellSectionProps = {
	children: ReactNode
	flexGrow?: number
	flexShrink?: number
	minHeight?: number
	paddingTop?: number
	shellWidth: number
}

export function AppShellLayout({
	buildLabel,
	renderFooter,
	renderView,
	terminalWidth
}: {
	buildLabel: string
	renderFooter: (shellWidth: number) => ReactNode
	renderView: (shellWidth: number) => ReactNode
	terminalWidth: number
}): ReactNode {
	const shellWidth = Math.max(52, terminalWidth - RHYTHM.pageX * 2)

	return (
		<box
			flexDirection='column'
			flexGrow={1}
			height='100%'
			minHeight={0}
			paddingTop={RHYTHM.pageY}
			width='100%'>
			<ShellSection shellWidth={shellWidth}>
				<AppHeader buildLabel={buildLabel} />
			</ShellSection>
			<ShellSection
				flexGrow={1}
				minHeight={0}
				paddingTop={RHYTHM.section}
				shellWidth={shellWidth}>
				{renderView(shellWidth)}
			</ShellSection>
			<ShellSection
				flexShrink={0}
				shellWidth={shellWidth}>
				{renderFooter(shellWidth)}
			</ShellSection>
		</box>
	)
}

function ShellSection({
	children,
	flexGrow = 0,
	flexShrink = 1,
	minHeight,
	paddingTop = 0,
	shellWidth
}: ShellSectionProps): ReactNode {
	return (
		<box
			flexDirection='column'
			flexGrow={flexGrow}
			flexShrink={flexShrink}
			minHeight={minHeight}
			paddingLeft={RHYTHM.pageX}
			paddingRight={RHYTHM.pageX}
			paddingTop={paddingTop}>
			<box
				flexGrow={flexGrow}
				justifyContent='center'
				minHeight={minHeight}
				width='100%'>
				<box
					flexDirection='column'
					flexGrow={flexGrow}
					minHeight={minHeight}
					width={shellWidth}>
					{children}
				</box>
			</box>
		</box>
	)
}
