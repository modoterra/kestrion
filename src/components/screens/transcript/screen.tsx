import { useTerminalDimensions } from '@opentui/react'
import type { ReactNode } from 'react'

import type { WorkerTranscriptEntry } from '../../../lib/types'
import { RHYTHM, THEME } from '../../../lib/ui/constants'
import { formatTime, truncate } from '../../../lib/ui/helpers'
import { StackViewFrame } from '../../ui/layout/stack-view-frame'
import { useWorkerTranscriptContext } from '../main/worker-transcript-context'

export function TranscriptScreen(): ReactNode {
	const { height } = useTerminalDimensions()
	const { sessionTitle, workerTranscriptEntries, workerTranscriptLoading } = useWorkerTranscriptContext()
	const groups = groupTranscriptEntries(workerTranscriptEntries)
	const transcriptHeight = Math.max(8, height - 8)

	return (
		<StackViewFrame
			breadcrumb={['main', 'transcript']}
			title='Transcript'>
			<box
				flexDirection='column'
				flexGrow={1}
				minHeight={0}>
				<scrollbox
					contentOptions={{ flexDirection: 'column', paddingBottom: 1 }}
					focused
					height={transcriptHeight}
					horizontalScrollbarOptions={{ visible: false }}
					stickyScroll
					stickyStart='bottom'
					verticalScrollbarOptions={{ visible: false }}>
					<box
						flexDirection='column'
						gap={RHYTHM.section}>
						<TranscriptHero sessionTitle={sessionTitle} />
						{renderTranscriptBody(workerTranscriptLoading, groups)}
					</box>
				</scrollbox>
			</box>
		</StackViewFrame>
	)
}

function TranscriptHero({ sessionTitle }: { sessionTitle: string }): ReactNode {
	return (
		<box
			flexDirection='column'
			gap={RHYTHM.stack}>
			<text
				fg={THEME.accent}
				selectable={false}>
				<strong>Daemon / worker wire transcript</strong>
			</text>
			<text
				fg={THEME.offWhite}
				selectable={false}>
				{sessionTitle}
			</text>
			<text
				fg={THEME.muted}
				selectable={false}>
				Complete over-the-wire traffic for the active conversation only.
			</text>
		</box>
	)
}

function renderTranscriptBody(
	workerTranscriptLoading: boolean,
	groups: Array<{ entries: WorkerTranscriptEntry[]; turnId: string }>
): ReactNode {
	if (workerTranscriptLoading && groups.length === 0) {
		return (
			<text
				fg={THEME.softText}
				selectable={false}>
				Loading transcript...
			</text>
		)
	}

	if (groups.length === 0) {
		return (
			<text
				fg={THEME.softText}
				selectable={false}>
				No daemon-worker transcript yet.
			</text>
		)
	}

	return groups.map(group => (
		<TranscriptTurnGroup
			entries={group.entries}
			key={group.turnId}
			turnId={group.turnId}
		/>
	))
}

function TranscriptTurnGroup({ entries, turnId }: { entries: WorkerTranscriptEntry[]; turnId: string }): ReactNode {
	return (
		<box
			borderColor={THEME.selectActive}
			borderStyle='rounded'
			flexDirection='column'
			gap={RHYTHM.stack}
			paddingX={1}
			paddingY={1}>
			<box
				flexDirection='column'
				gap={1}>
				<text
					fg={THEME.summaryAccent}
					selectable={false}>
					<strong>{`Turn ${truncate(turnId, 18)}`}</strong>
				</text>
				<text
					fg={THEME.muted}
					selectable={false}>
					{turnId}
				</text>
			</box>

			{entries.map(entry => (
				<TranscriptEntryRow
					entry={entry}
					key={entry.id}
				/>
			))}
		</box>
	)
}

function TranscriptEntryRow({ entry }: { entry: WorkerTranscriptEntry }): ReactNode {
	return (
		<box
			backgroundColor={THEME.panelRaised}
			flexDirection='column'
			gap={1}
			paddingX={1}
			paddingY={1}>
			<text
				fg={THEME.softLabel}
				selectable={false}>
				{`${formatDirection(entry.direction)} · ${entry.kind} · ${formatTime(entry.createdAt)} · #${entry.sequence}`}
			</text>
			<text
				fg={THEME.offWhite}
				selectable>
				{formatPayloadJson(entry.payloadJson)}
			</text>
		</box>
	)
}

function groupTranscriptEntries(
	entries: WorkerTranscriptEntry[]
): Array<{ entries: WorkerTranscriptEntry[]; turnId: string }> {
	const groups: Array<{ entries: WorkerTranscriptEntry[]; turnId: string }> = []

	for (const entry of entries) {
		const lastGroup = groups.at(-1)
		if (lastGroup?.turnId === entry.turnId) {
			lastGroup.entries.push(entry)
			continue
		}

		groups.push({ entries: [entry], turnId: entry.turnId })
	}

	return groups
}

function formatDirection(direction: WorkerTranscriptEntry['direction']): string {
	return direction === 'daemonToWorker' ? 'daemon -> worker' : 'worker -> daemon'
}

function formatPayloadJson(payloadJson: string): string {
	try {
		return JSON.stringify(JSON.parse(payloadJson) as unknown, null, 2)
	} catch {
		return payloadJson
	}
}
