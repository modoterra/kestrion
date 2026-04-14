import type { ReactNode } from 'react'

import { THEME } from '../../../lib/ui/constants'
import { Logo } from './logo'

export function AppHeader({ buildLabel }: { buildLabel: string }): ReactNode {
	return (
		<box
			flexDirection='row'
			justifyContent='space-between'
			width='100%'>
			<Logo />

			<box
				alignItems='center'
				justifyContent='center'>
				<text
					fg={THEME.muted}
					selectable={false}>
					{buildLabel}
				</text>
			</box>
		</box>
	)
}
