import type { ReactNode } from 'react'

import type { TurnActivityState } from '../../../lib/app/main-screen-turn-activity-state'
import { getTemperatureSummary } from '../../../lib/provider-config/utils'
import type { ActivityIndicatorVariant } from '../../../lib/ui/activity-indicator'
import { RHYTHM, THEME } from '../../../lib/ui/constants'
import {
	EMPTY_CONTEXT_GLYPH_COLOR,
	getContextUsageGlyphColor,
	getContextUsageRatio
} from '../../../lib/ui/context-usage'
import { formatCompactCount, formatUsagePercent } from '../../../lib/ui/formatting'
import { compactModelName, compactProviderName, formatElapsedDuration, truncate } from '../../../lib/ui/helpers'
import { ActivityIndicator } from './activity-indicator'

type RailGroup = {
	accentColor: string
	accentContent: ReactNode
	key: string
	labelColor: string
	labelContent: ReactNode
}

type ActivityLabel = { indicatorVariant: ActivityIndicatorVariant | null; text: string }

type TurnActivityRailProps = {
	contextUsageChars: number
	maxTokens: number
	model: string
	promptTruncateLength: number
	providerLabel: string
	providerMode: 'custom' | 'fireworks' | null
	spinnerFrameIndex: number
	temperature: number
	turnActivity: TurnActivityState
	width: number
}

type RailGroupsArgs = {
	contextUsageChars: number
	maxTokens: number
	model: string
	providerLabel: string
	providerMode: 'custom' | 'fireworks' | null
	promptTruncateLength: number
	temperature: number
	width: number
}

export function TurnActivityRail(props: TurnActivityRailProps): ReactNode {
	const identityWidth = Math.max(18, Math.floor(props.width * 0.68))
	const activityWidth = Math.max(12, props.width - identityWidth - 4)
	const activityLabel = buildActivityLabel(props.turnActivity, activityWidth)

	return (
		<box
			flexDirection='column'
			height={2}
			justifyContent='flex-end'
			paddingTop={RHYTHM.stack}
			width='100%'>
			<box
				alignItems='center'
				flexDirection='row'
				height={1}
				justifyContent='space-between'
				width='100%'>
				<RailIdentityGroups
					groups={buildRailGroups({ ...props, width: identityWidth })}
					width={identityWidth}
				/>
				<text
					fg={getActivityAccent(props.turnActivity)}
					selectable={false}
					wrapMode='none'>
					{activityLabel.indicatorVariant ? (
						<>
							<ActivityIndicator
								frameIndex={props.spinnerFrameIndex}
								variant={activityLabel.indicatorVariant}
							/>{' '}
							{activityLabel.text}
						</>
					) : (
						activityLabel.text
					)}
				</text>
			</box>
		</box>
	)
}

function RailIdentityGroups({ groups, width }: { groups: RailGroup[]; width: number }): ReactNode {
	return (
		<box
			alignItems='center'
			flexDirection='row'
			gap={2}
			minWidth={0}
			width={width}>
			{groups.map(group => (
				<box
					alignItems='center'
					flexDirection='row'
					flexShrink={0}
					gap={1}
					key={group.key}>
					<text
						fg={group.accentColor}
						selectable={false}
						wrapMode='none'>
						{group.accentContent}
					</text>
					<text
						fg={group.labelColor}
						selectable={false}
						wrapMode='none'>
						{group.labelContent}
					</text>
				</box>
			))}
		</box>
	)
}

function buildRailGroups(args: RailGroupsArgs): RailGroup[] {
	const groups = [buildProviderGroup(args), buildModelGroup(args.model)]

	if (args.width >= 42) {
		groups.push(buildContextGroup(args.contextUsageChars, args.promptTruncateLength, args.width))
	}

	if (args.width >= 56) {
		groups.push(buildOutputGroup(args.maxTokens))
	}

	if (args.width >= 70) {
		groups.push(buildTemperatureGroup(args.temperature))
	}

	return groups
}

function buildProviderGroup({
	providerLabel,
	providerMode
}: Pick<RailGroupsArgs, 'providerLabel' | 'providerMode'>): RailGroup {
	return {
		accentColor: THEME.providerBlue,
		accentContent: compactProviderName(providerLabel),
		key: 'provider',
		labelColor: THEME.softText,
		labelContent: providerMode === 'custom' ? 'custom' : 'provider'
	}
}

function buildModelGroup(model: string): RailGroup {
	return {
		accentColor: THEME.offWhite,
		accentContent: compactModelName(model),
		key: 'model',
		labelColor: THEME.softLabel,
		labelContent: 'model'
	}
}

function buildContextGroup(contextUsageChars: number, promptTruncateLength: number, width: number): RailGroup {
	const usageRatio = getContextUsageRatio(contextUsageChars, promptTruncateLength)
	const usagePercent = formatUsagePercent(contextUsageChars, promptTruncateLength)
	const usageBar =
		width >= 72
			? buildContextUsageBar(contextUsageChars, promptTruncateLength, 8)
			: buildContextUsageBar(contextUsageChars, promptTruncateLength, 5)

	return {
		accentColor: getContextUsageGlyphColor(usageRatio),
		accentContent: `${formatCompactCount(contextUsageChars)}/${formatCompactCount(promptTruncateLength)}`,
		key: 'context',
		labelColor: THEME.softLabel,
		labelContent:
			width >= 56 ? (
				<>
					ctx {usageBar} {usagePercent}
				</>
			) : (
				`ctx ${usagePercent}`
			)
	}
}

function buildOutputGroup(maxTokens: number): RailGroup {
	return {
		accentColor: THEME.focusAccent,
		accentContent: formatCompactCount(maxTokens),
		key: 'output',
		labelColor: THEME.softLabel,
		labelContent: 'out'
	}
}

function buildTemperatureGroup(temperature: number): RailGroup {
	return {
		accentColor: THEME.accent,
		accentContent: getTemperatureSummary(String(temperature)),
		key: 'temperature',
		labelColor: THEME.softLabel,
		labelContent: 'temp'
	}
}

function buildContextUsageBar(usedChars: number, limitChars: number, slots: number): ReactNode {
	const ratio = getContextUsageRatio(usedChars, limitChars)
	const filledSlots = ratio === 0 ? 0 : Math.max(1, Math.min(slots, Math.round(ratio * slots)))

	return Array.from({ length: slots }, (_, index) => {
		const slotProgress = slots === 1 ? ratio : index / Math.max(1, slots - 1)
		const filled = index < filledSlots

		return (
			<span
				fg={filled ? getContextUsageGlyphColor(slotProgress) : EMPTY_CONTEXT_GLYPH_COLOR}
				key={`ctx-bar:${slots}:${index}`}>
				{filled ? '█' : '░'}
			</span>
		)
	})
}

function buildActivityLabel(turnActivity: TurnActivityState, width: number): ActivityLabel {
	if (turnActivity.phase === 'idle') {
		return { indicatorVariant: null, text: buildIdleLabel(turnActivity, width) }
	}

	if (turnActivity.phase === 'failed') {
		return {
			indicatorVariant: null,
			text: buildCompletionLabel('failed', '!!', turnActivity.lastTurnDurationSeconds ?? turnActivity.elapsedSeconds)
		}
	}

	const timerLabel = formatElapsedDuration(turnActivity.elapsedSeconds)
	const phaseLabel = turnActivity.phase === 'streaming' ? 'streaming' : 'waiting'

	return {
		indicatorVariant: turnActivity.phase === 'streaming' ? 'accent' : 'provider',
		text: truncate(`${phaseLabel} ${timerLabel}`, Math.max(10, width - 2))
	}
}

function buildIdleLabel(turnActivity: TurnActivityState, width: number): string {
	const lastTurnLabel = buildLastTurnLabel(turnActivity)
	const idleLabel = lastTurnLabel ? `${lastTurnLabel} · ready` : 'ready'
	return truncate(idleLabel, Math.max(14, Math.floor(width * 0.4)))
}

function buildLastTurnLabel(turnActivity: TurnActivityState): string {
	if (turnActivity.lastTurnResult === 'success') {
		return buildCompletionLabel('done', 'v', turnActivity.lastTurnDurationSeconds)
	}

	if (turnActivity.lastTurnResult === 'failed') {
		return buildCompletionLabel('failed', '!!', turnActivity.lastTurnDurationSeconds)
	}

	if (turnActivity.lastTurnResult === 'cancelled') {
		return buildCompletionLabel('cancelled', '~', turnActivity.lastTurnDurationSeconds)
	}

	return ''
}

function buildCompletionLabel(label: string, prefix: string, durationSeconds: number | null): string {
	return `${prefix} ${label} ${formatElapsedDuration(durationSeconds ?? 0)}`
}

function getActivityAccent(turnActivity: TurnActivityState): string {
	if (turnActivity.phase === 'failed' || turnActivity.lastTurnResult === 'failed') {
		return THEME.danger
	}

	if (turnActivity.phase === 'streaming') {
		return THEME.accent
	}

	if (turnActivity.phase === 'waiting') {
		return THEME.providerBlue
	}

	if (turnActivity.lastTurnResult === 'cancelled') {
		return THEME.muted
	}

	return THEME.offWhite
}
