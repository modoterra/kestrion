import type { ReactNode } from 'react'

import { RHYTHM } from '../../../lib/ui/constants'

export function FloatingNotice({
	backgroundColor,
	bottom,
	children,
	left,
	right,
	width,
	zIndex
}: {
	backgroundColor: string
	bottom: number
	children: ReactNode
	left?: number
	right?: number
	width?: number
	zIndex: number
}): ReactNode {
	return (
		<box
			backgroundColor={backgroundColor}
			bottom={bottom}
			left={left}
			paddingBottom={RHYTHM.panelY}
			paddingLeft={RHYTHM.panelX}
			paddingRight={RHYTHM.panelX}
			paddingTop={RHYTHM.panelY}
			position='absolute'
			right={right}
			width={width}
			zIndex={zIndex}>
			{children}
		</box>
	)
}
