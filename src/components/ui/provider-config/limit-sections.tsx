import type { SelectOption } from '@opentui/core'
import type { ReactNode } from 'react'

import type { FocusField } from '../../../lib/provider-config/types'
import { PresetSection } from './sections'

type LimitPresetGroupProps = {
	currentField: FocusField
	explanation: string
	field:
		| 'maxTokens'
		| 'promptTruncateLength'
		| 'compactTailTurns'
		| 'compactAutoTurnThreshold'
		| 'compactAutoPromptChars'
		| 'temperature'
	onAdvance: () => void
	onSelect: (value: string) => void
	options: SelectOption[]
	selectedIndex: number
	title: string
}

export type LimitsSectionProps = {
	compactAutoPromptCharsIndex: number
	compactAutoPromptCharsOptions: SelectOption[]
	compactAutoTurnThresholdIndex: number
	compactAutoTurnThresholdOptions: SelectOption[]
	compactTailTurnsIndex: number
	compactTailTurnsOptions: SelectOption[]
	currentField: FocusField
	maxTokenIndex: number
	maxTokenOptions: SelectOption[]
	onAdvance: () => void
	onSelectCompactAutoPromptChars: (value: string) => void
	onSelectCompactAutoTurnThreshold: (value: string) => void
	onSelectCompactTailTurns: (value: string) => void
	onSelectMaxTokens: (value: string) => void
	onSelectPromptTruncateLength: (value: string) => void
	onSelectTemperature: (value: string) => void
	promptTruncateIndex: number
	promptTruncateOptions: SelectOption[]
	temperatureIndex: number
	temperatureOptions: SelectOption[]
}

export function LimitsSections(props: LimitsSectionProps): ReactNode {
	return (
		<>
			{buildLimitPresetGroups(props).map(group => (
				<LimitPresetGroup
					{...group}
					key={group.field}
				/>
			))}
		</>
	)
}

function LimitPresetGroup(props: LimitPresetGroupProps): ReactNode {
	return (
		<PresetSection
			currentField={props.currentField}
			explanation={props.explanation}
			field={props.field}
			onAdvance={props.onAdvance}
			onSelect={props.onSelect}
			options={props.options}
			selectedIndex={props.selectedIndex}
			title={props.title}
		/>
	)
}

function buildLimitPresetGroups({
	compactAutoPromptCharsIndex,
	compactAutoPromptCharsOptions,
	compactAutoTurnThresholdIndex,
	compactAutoTurnThresholdOptions,
	compactTailTurnsIndex,
	compactTailTurnsOptions,
	currentField,
	maxTokenIndex,
	maxTokenOptions,
	onAdvance,
	onSelectCompactAutoPromptChars,
	onSelectCompactAutoTurnThreshold,
	onSelectCompactTailTurns,
	onSelectMaxTokens,
	onSelectPromptTruncateLength,
	onSelectTemperature,
	promptTruncateIndex,
	promptTruncateOptions,
	temperatureIndex,
	temperatureOptions
}: LimitsSectionProps): LimitPresetGroupProps[] {
	return [
		{
			currentField,
			explanation: 'Choose how much output the model can generate for a single reply.',
			field: 'maxTokens',
			onAdvance,
			onSelect: onSelectMaxTokens,
			options: maxTokenOptions,
			selectedIndex: maxTokenIndex,
			title: 'Maximum Tokens'
		},
		{
			currentField,
			explanation: 'Set how much conversation history is kept before older context is trimmed.',
			field: 'promptTruncateLength',
			onAdvance,
			onSelect: onSelectPromptTruncateLength,
			options: promptTruncateOptions,
			selectedIndex: promptTruncateIndex,
			title: 'Prompt Truncation'
		},
		{
			currentField,
			explanation: 'Keep this many most recent turns raw after a checkpoint summary is created.',
			field: 'compactTailTurns',
			onAdvance,
			onSelect: onSelectCompactTailTurns,
			options: compactTailTurnsOptions,
			selectedIndex: compactTailTurnsIndex,
			title: 'Compact Tail Turns'
		},
		{
			currentField,
			explanation: 'Auto-compact when the raw suffix after the checkpoint grows past this many turns.',
			field: 'compactAutoTurnThreshold',
			onAdvance,
			onSelect: onSelectCompactAutoTurnThreshold,
			options: compactAutoTurnThresholdOptions,
			selectedIndex: compactAutoTurnThresholdIndex,
			title: 'Auto Compact Turns'
		},
		{
			currentField,
			explanation: 'Auto-compact when the serialized raw suffix grows past this many characters.',
			field: 'compactAutoPromptChars',
			onAdvance,
			onSelect: onSelectCompactAutoPromptChars,
			options: compactAutoPromptCharsOptions,
			selectedIndex: compactAutoPromptCharsIndex,
			title: 'Auto Compact Chars'
		},
		{
			currentField,
			explanation: 'Lower is more deterministic. Higher is more creative.',
			field: 'temperature',
			onAdvance,
			onSelect: onSelectTemperature,
			options: temperatureOptions,
			selectedIndex: temperatureIndex,
			title: 'Temperature'
		}
	]
}
