import type { ReactNode } from 'react'

import { useViewStack } from '../../../lib/navigation/view-stack'
import type { ToolCatalogEntry } from '../../../lib/tools'
import { RHYTHM, THEME } from '../../../lib/ui/constants'
import { useKeyboardHandler } from '../../../lib/ui/keyboard'
import { StackViewFrame } from '../../ui/layout/stack-view-frame'

export function ToolDetailScreen({ tool }: { tool: ToolCatalogEntry }): ReactNode {
	const viewStack = useViewStack()

	useKeyboardHandler(key => {
		if (key.defaultPrevented || key.name !== 'escape') {
			return
		}

		viewStack.pop()
		key.preventDefault()
		key.stopPropagation()
	})

	return (
		<StackViewFrame
			breadcrumb={['main', 'tools', tool.name]}
			title='Tool details'>
			<box
				flexDirection='column'
				flexGrow={1}
				minHeight={0}>
				<scrollbox
					contentOptions={{ flexDirection: 'column', paddingBottom: 1 }}
					horizontalScrollbarOptions={{ visible: false }}
					verticalScrollbarOptions={{ visible: false }}>
					<box
						flexDirection='column'
						gap={RHYTHM.section}>
						<ToolHero tool={tool} />
						<ToolRestrictions restrictions={tool.restrictions} />
						<ToolParameters parameters={tool.parameters} />
					</box>
				</scrollbox>
			</box>
		</StackViewFrame>
	)
}

function ToolHero({ tool }: { tool: ToolCatalogEntry }): ReactNode {
	return (
		<box
			flexDirection='column'
			gap={RHYTHM.stack}>
			<text
				fg={THEME.accent}
				selectable={false}>
				<strong>{tool.name}</strong>
			</text>
			<text
				fg={THEME.offWhite}
				selectable={false}>
				{tool.description}
			</text>
			<ToolMetaLine
				label='category'
				value={tool.category}
			/>
			<ToolMetaLine
				label='scope'
				value={tool.scope}
			/>
			<ToolMetaLine
				label='execution'
				value={tool.execution}
			/>
		</box>
	)
}

function ToolMetaLine({ label, value }: { label: string; value: string }): ReactNode {
	return (
		<box
			flexDirection='row'
			gap={1}>
			<text
				fg={THEME.muted}
				selectable={false}
				wrapMode='none'>
				{label}
			</text>
			<text
				fg={THEME.softText}
				selectable={false}
				wrapMode='none'>
				{value}
			</text>
		</box>
	)
}

function ToolRestrictions({ restrictions }: { restrictions: ToolCatalogEntry['restrictions'] }): ReactNode {
	return (
		<box
			flexDirection='column'
			gap={RHYTHM.stack}>
			<SectionTitle title='Restrictions' />
			{restrictions.map(item => (
				<ToolBulletLine
					key={item}
					text={item}
				/>
			))}
		</box>
	)
}

function ToolParameters({ parameters }: { parameters: ToolCatalogEntry['parameters'] }): ReactNode {
	return (
		<box
			flexDirection='column'
			gap={RHYTHM.stack}>
			<SectionTitle title='Parameters' />
			{parameters.map(parameter => (
				<box
					flexDirection='column'
					gap={1}
					key={parameter.name}>
					<text
						fg={THEME.accent}
						selectable={false}>
						{parameter.name}
					</text>
					<text
						fg={THEME.muted}
						selectable={false}>
						{formatParameterMeta(parameter.required, parameter.type)}
					</text>
					<text
						fg={THEME.offWhite}
						selectable={false}>
						{parameter.description}
					</text>
				</box>
			))}
		</box>
	)
}

function SectionTitle({ title }: { title: string }): ReactNode {
	return (
		<text
			fg={THEME.summaryAccent}
			selectable={false}>
			<strong>{title}</strong>
		</text>
	)
}

function ToolBulletLine({ text }: { text: string }): ReactNode {
	return (
		<box
			flexDirection='row'
			gap={1}>
			<text
				fg={THEME.accent}
				selectable={false}
				wrapMode='none'>
				-
			</text>
			<text
				fg={THEME.offWhite}
				selectable={false}>
				{text}
			</text>
		</box>
	)
}

function formatParameterMeta(required: boolean, type: string): string {
	return `${required ? 'required' : 'optional'} · ${type}`
}
