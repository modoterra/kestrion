import { useMemo, type ReactNode } from 'react'

import { useViewStack } from '../../../lib/navigation/view-stack'
import { getMemoryLabel, type MemoryKind, type MemorySnapshot } from '../../../lib/storage/memory-store'
import { truncate } from '../../../lib/ui/helpers'
import { ViewSelect, type ViewSelectOption } from '../../ui/navigation/view-select'
import { MemoryDetailScreen } from './detail-screen'

export function MemoryScreen({ snapshot }: { snapshot: MemorySnapshot }): ReactNode {
	const viewStack = useViewStack()
	const options = useMemo(() => buildMemoryOptions(snapshot), [snapshot])

	return (
		<ViewSelect
			onSelect={option => {
				viewStack.push({
					element: (
						<MemoryDetailScreen
							kind={option.value}
							snapshot={snapshot}
						/>
					)
				})
			}}
			options={options}
			placeholder='Search memories'
			title='Memory'
		/>
	)
}

function buildMemoryOptions(snapshot: MemorySnapshot): ViewSelectOption<MemoryKind>[] {
	return [
		{ description: buildScratchSummary(snapshot.scratch), title: getMemoryLabel('scratch'), value: 'scratch' },
		{ description: buildStructuredSummary(snapshot.episodic), title: getMemoryLabel('episodic'), value: 'episodic' },
		{ description: buildStructuredSummary(snapshot.longTerm), title: getMemoryLabel('long-term'), value: 'long-term' }
	]
}

function buildScratchSummary(content: string): string {
	const normalized = content.replaceAll(/\s+/g, ' ').trim()
	if (!normalized) {
		return 'Temporary notes and working context'
	}

	return `${countContentLines(content)} lines · ${truncate(normalized, 56)}`
}

function buildStructuredSummary(entries: MemorySnapshot['episodic']): string {
	if (entries.length === 0) {
		return 'No saved entries yet'
	}

	const latest = entries[0]
	const previewSource = latest?.title.trim() || latest?.content.replaceAll(/\s+/g, ' ').trim() || 'Saved entry'
	return `${entries.length} saved ${entries.length === 1 ? 'entry' : 'entries'} · ${truncate(previewSource, 52)}`
}

function countContentLines(content: string): number {
	return content.split(/\r?\n/).length
}
