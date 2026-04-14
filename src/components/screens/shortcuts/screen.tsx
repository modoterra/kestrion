import type { ReactNode } from 'react'

import { RHYTHM, SHORTCUTS, THEME } from '../../../lib/ui/constants'
import { StackViewFrame } from '../../ui/layout/stack-view-frame'

export function ShortcutsScreen(): ReactNode {
	return (
		<StackViewFrame title='Shortcuts'>
			<box
				flexDirection='column'
				gap={RHYTHM.section}>
				<text
					fg={THEME.muted}
					selectable={false}>
					Keyboard-first controls for the current shell.
				</text>

				<box
					flexDirection='column'
					gap={RHYTHM.stack}>
					{SHORTCUTS.map(shortcut => (
						<box
							flexDirection='row'
							justifyContent='space-between'
							key={shortcut.command}>
							<text
								fg={THEME.accent}
								selectable={false}
								wrapMode='none'>
								{shortcut.command}
							</text>
							<text
								fg={THEME.muted}
								selectable={false}>
								{shortcut.description}
							</text>
						</box>
					))}
				</box>
			</box>
		</StackViewFrame>
	)
}
