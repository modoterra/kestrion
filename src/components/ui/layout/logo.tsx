import type { ReactNode } from 'react'

import { THEME } from '../../../lib/ui/constants'

type LogoSegment = { color: keyof typeof THEME; key: string; text: string }

const LOGO_ROWS: LogoSegment[][] = [
	[
		{ color: 'logoShade1', key: 'k', text: '█▄▀ ' },
		{ color: 'logoShade2', key: 'e', text: '█▀▀ ' },
		{ color: 'logoShade3', key: 's1', text: '█▀▀ ' },
		{ color: 'logoShade4', key: 't', text: '▀█▀ ' },
		{ color: 'logoShade5', key: 'r', text: '█▀█ ' },
		{ color: 'logoShade4', key: 'i', text: '█ ' },
		{ color: 'logoShade3', key: 'o', text: '█▀█ ' },
		{ color: 'logoShade2', key: 'n1', text: '█▄ ' },
		{ color: 'logoShade1', key: 'n2', text: '█' }
	],
	[
		{ color: 'logoShade1', key: 'k2', text: '█ █ ' },
		{ color: 'logoShade2', key: 'e2', text: '██▄ ' },
		{ color: 'logoShade3', key: 's2', text: '▄▄█ ' },
		{ color: 'logoShade4', key: 't2', text: ' █ ' },
		{ color: 'logoShade5', key: 'r2', text: ' █▀▄ ' },
		{ color: 'logoShade4', key: 'i2', text: '█ ' },
		{ color: 'logoShade3', key: 'o2', text: '█▄█ ' },
		{ color: 'logoShade2', key: 'n3', text: '█ ' },
		{ color: 'logoShade1', key: 'n4', text: '▀█' }
	]
]

export function Logo(): ReactNode {
	return (
		<box flexDirection='column'>
			{LOGO_ROWS.map(row => (
				<LogoRow
					key={row.map(segment => segment.key).join(':')}
					row={row}
				/>
			))}
		</box>
	)
}

function LogoRow({ row }: { row: LogoSegment[] }): ReactNode {
	return (
		<box flexDirection='row'>
			{row.map(segment => (
				<text
					fg={THEME[segment.color]}
					key={segment.key}
					selectable={false}>
					{segment.text}
				</text>
			))}
		</box>
	)
}
