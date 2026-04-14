import type { ReactNode } from 'react'

import { useViewStack } from '../../../lib/navigation/view-stack'
import { RHYTHM, THEME } from '../../../lib/ui/constants'
import { useKeyboardHandler } from '../../../lib/ui/keyboard'

type BreadcrumbSegment = { current: boolean; key: string; label: string; showDivider: boolean }

export function StackViewFrame({
	breadcrumb,
	children,
	title
}: {
	breadcrumb?: string[]
	children: ReactNode
	title: string
}): ReactNode {
	const viewStack = useViewStack()
	const crumbs = buildBreadcrumbSegments(breadcrumb, title)

	useKeyboardHandler(key => {
		if (key.defaultPrevented || key.name !== 'escape') {
			return
		}

		viewStack.pop()
		key.preventDefault()
		key.stopPropagation()
	})

	return (
		<box
			flexDirection='column'
			flexGrow={1}
			minHeight={0}
			width='100%'>
			<StackViewHeader
				crumbs={crumbs}
				onBack={() => viewStack.pop()}
			/>

			<box
				flexDirection='column'
				flexGrow={1}
				minHeight={0}
				paddingTop={RHYTHM.stack}>
				{children}
			</box>
		</box>
	)
}

function StackViewHeader({ crumbs, onBack }: { crumbs: BreadcrumbSegment[]; onBack: () => void }): ReactNode {
	return (
		<box
			flexDirection='row'
			justifyContent='space-between'>
			<BreadcrumbTrail crumbs={crumbs} />
			<StackViewBackAction onBack={onBack} />
		</box>
	)
}

function BreadcrumbTrail({ crumbs }: { crumbs: BreadcrumbSegment[] }): ReactNode {
	return (
		<box
			flexDirection='row'
			gap={1}>
			{crumbs.map(segment => (
				<box
					flexDirection='row'
					gap={1}
					key={segment.key}>
					{segment.showDivider ? (
						<text
							fg={THEME.muted}
							selectable={false}
							wrapMode='none'>
							/
						</text>
					) : null}
					<text
						fg={segment.current ? THEME.offWhite : THEME.muted}
						selectable={false}
						wrapMode='none'>
						{segment.current ? <strong>{segment.label}</strong> : segment.label}
					</text>
				</box>
			))}
		</box>
	)
}

function StackViewBackAction({ onBack }: { onBack: () => void }): ReactNode {
	return (
		<box
			flexDirection='row'
			gap={1}
			onMouseUp={onBack}>
			<text
				fg={THEME.accent}
				selectable={false}
				wrapMode='none'>
				esc
			</text>
			<text
				fg={THEME.muted}
				selectable={false}
				wrapMode='none'>
				back
			</text>
		</box>
	)
}

function buildBreadcrumbSegments(breadcrumb: string[] | undefined, title: string): BreadcrumbSegment[] {
	const labels = breadcrumb?.length ? breadcrumb : ['main', title.toLowerCase()]
	let path = ''

	return labels.map((label, index) => {
		path = path ? `${path}/${label}` : label
		return { current: index === labels.length - 1, key: path, label, showDivider: index > 0 }
	})
}
