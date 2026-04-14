import type { ReactNode } from 'react'

import { SHORTCUTS, THEME } from '../../../lib/ui/constants'

type FooterShortcut = Extract<(typeof SHORTCUTS)[number], { footerLabel: string }>

export function AppFooter({ width }: { width: number }): ReactNode {
	const visibleShortcuts = getVisibleShortcuts(width)

	return (
		<box
			flexDirection='row'
			gap={2}
			minWidth={0}
			width='100%'>
			{visibleShortcuts.map(shortcut => (
				<box
					flexDirection='row'
					gap={1}
					key={shortcut.command}>
					<text
						fg={THEME.accent}
						selectable={false}
						wrapMode='none'>
						{shortcut.command}
					</text>
					<text
						fg={THEME.muted}
						selectable={false}
						wrapMode='none'>
						{shortcut.footerLabel}
					</text>
				</box>
			))}
		</box>
	)
}

function getVisibleShortcuts(width: number): FooterShortcut[] {
	const footerShortcuts = SHORTCUTS.filter(shortcut => isFooterShortcut(shortcut))
	const visible: FooterShortcut[] = []
	let usedWidth = 0

	for (const shortcut of footerShortcuts) {
		const itemWidth = shortcut.command.length + 1 + shortcut.footerLabel.length
		const nextWidth = visible.length === 0 ? itemWidth : usedWidth + 2 + itemWidth

		if (nextWidth > width) {
			break
		}

		visible.push(shortcut)
		usedWidth = nextWidth
	}

	return visible
}

function isFooterShortcut(shortcut: (typeof SHORTCUTS)[number]): shortcut is FooterShortcut {
	return 'footerLabel' in shortcut
}
