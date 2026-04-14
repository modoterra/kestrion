import type { ReactNode } from 'react'

import { getMemoryLabel, type MemoryKind, type MemorySnapshot, type StoredMemoryEntry } from '../../../lib/memory-store'
import { RHYTHM, THEME } from '../../../lib/ui/constants'
import { formatTime, truncate } from '../../../lib/ui/helpers'
import { StackViewFrame } from '../../ui/layout/stack-view-frame'

export function MemoryDetailScreen({ kind, snapshot }: { kind: MemoryKind; snapshot: MemorySnapshot }): ReactNode {
	return (
		<StackViewFrame
			breadcrumb={['main', 'memory', kind]}
			title='Memory'>
			<box
				flexDirection='column'
				flexGrow={1}
				minHeight={0}>
				<scrollbox
					contentOptions={{ flexDirection: 'column', paddingBottom: 1 }}
					horizontalScrollbarOptions={{ visible: false }}
					verticalScrollbarOptions={{ visible: false }}>
					{kind === 'scratch' ? (
						<ScratchMemorySection content={snapshot.scratch} />
					) : (
						<StructuredMemorySection
							entries={kind === 'episodic' ? snapshot.episodic : snapshot.longTerm}
							kind={kind}
						/>
					)}
				</scrollbox>
			</box>
		</StackViewFrame>
	)
}

function ScratchMemorySection({ content }: { content: string }): ReactNode {
	return (
		<box
			flexDirection='column'
			gap={RHYTHM.section}>
			<MemoryHero
				description='Temporary working notes and in-flight context.'
				kind='scratch'
			/>
			<MemorySectionTitle title='Content' />
			<MemoryBodyText text={content.trim() || 'No scratch memory saved yet.'} />
		</box>
	)
}

function StructuredMemorySection({
	entries,
	kind
}: {
	entries: StoredMemoryEntry[]
	kind: Extract<MemoryKind, 'episodic' | 'long-term'>
}): ReactNode {
	return (
		<box
			flexDirection='column'
			gap={RHYTHM.section}>
			<MemoryHero
				description={
					kind === 'episodic' ? 'Recent experiences and event notes.' : 'Durable preferences and reference knowledge.'
				}
				kind={kind}
			/>
			<MemorySectionTitle title='Entries' />
			{entries.length === 0 ? (
				<MemoryBodyText text={`No ${kind} memories saved yet.`} />
			) : (
				<box
					flexDirection='column'
					gap={RHYTHM.section}>
					{entries.map(entry => (
						<MemoryEntryCard
							entry={entry}
							key={entry.id}
						/>
					))}
				</box>
			)}
		</box>
	)
}

function MemoryHero({ description, kind }: { description: string; kind: MemoryKind }): ReactNode {
	return (
		<box
			flexDirection='column'
			gap={RHYTHM.stack}>
			<text
				fg={THEME.accent}
				selectable={false}>
				<strong>{getMemoryLabel(kind)}</strong>
			</text>
			<text
				fg={THEME.offWhite}
				selectable={false}>
				{description}
			</text>
		</box>
	)
}

function MemoryEntryCard({ entry }: { entry: StoredMemoryEntry }): ReactNode {
	const title = entry.title.trim() || truncate(entry.content.replaceAll(/\s+/g, ' ').trim(), 48)
	const meta = [formatTime(entry.createdAt)]
	if (entry.tags.length > 0) {
		meta.push(entry.tags.map(tag => `#${tag}`).join(' '))
	}

	return (
		<box
			borderColor={THEME.selectActive}
			borderStyle='rounded'
			flexDirection='column'
			gap={1}
			paddingX={1}
			paddingY={1}>
			<text
				fg={THEME.summaryAccent}
				selectable={false}>
				<strong>{title || 'Untitled memory'}</strong>
			</text>
			<text
				fg={THEME.muted}
				selectable={false}>
				{meta.join(' · ')}
			</text>
			<MemoryBodyText text={entry.content} />
		</box>
	)
}

function MemorySectionTitle({ title }: { title: string }): ReactNode {
	return (
		<text
			fg={THEME.summaryAccent}
			selectable={false}>
			<strong>{title}</strong>
		</text>
	)
}

function MemoryBodyText({ text }: { text: string }): ReactNode {
	return (
		<text
			fg={THEME.offWhite}
			selectable={false}>
			{text}
		</text>
	)
}
