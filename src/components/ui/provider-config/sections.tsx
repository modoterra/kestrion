import type { SelectOption } from '@opentui/core'
import type { ReactNode } from 'react'

import type { ProviderDraft, ProviderTabId } from '../../../lib/provider-config/fields'
import type { FocusField, StepId } from '../../../lib/provider-config/types'
import {
	configureSearchField,
	getModelSummary,
	getMultilineSelectHeight,
	getProviderSummary,
	getStepLabel,
	getTemperatureSummary
} from '../../../lib/provider-config/utils'
import type { ProviderModelRecord } from '../../../lib/types'
import { THEME } from '../../../lib/ui/constants'
import { configureShortcutFriendlyField } from '../../../lib/ui/helpers'
import { AppInput, AppSelect } from '../forms/controls'
import { SearchSelectInput } from '../forms/search-select-input'

export function StepStrip({ currentStep, steps }: { currentStep: StepId; steps: StepId[] }): ReactNode {
	return (
		<box
			flexDirection='row'
			flexWrap='wrap'
			gap={2}>
			{steps.map(step => (
				<box
					flexDirection='row'
					gap={1}
					key={step}>
					<text
						fg={step === currentStep ? THEME.focusAccent : THEME.muted}
						selectable={false}
						wrapMode='none'>
						·
					</text>
					<text
						fg={step === currentStep ? THEME.focusAccent : THEME.muted}
						selectable={false}
						wrapMode='none'>
						{getStepLabel(step)}
					</text>
				</box>
			))}
		</box>
	)
}

export function SummaryLine({
	activeProviderId,
	draft,
	fireworksModels
}: {
	activeProviderId: ProviderTabId
	draft: ProviderDraft
	fireworksModels: ProviderModelRecord[]
}): ReactNode {
	return (
		<box
			flexDirection='row'
			flexWrap='wrap'
			gap={1}>
			<SummarySegment
				label='provider'
				value={getProviderSummary(activeProviderId)}
			/>
			<SummarySegment
				label='model'
				value={getModelSummary(activeProviderId, draft.model, fireworksModels)}
			/>
			<SummarySegment
				label='out'
				value={draft.maxTokens}
			/>
			<SummarySegment
				label='ctx'
				value={draft.promptTruncateLength}
			/>
			<SummarySegment
				label='temp'
				value={getTemperatureSummary(draft.temperature)}
			/>
		</box>
	)
}

export function Shortcut({ command, label }: { command: string; label: string }): ReactNode {
	return (
		<box
			flexDirection='row'
			gap={1}>
			<text
				fg={THEME.accent}
				selectable={false}
				wrapMode='none'>
				{command}
			</text>
			<text
				fg={THEME.muted}
				selectable={false}
				wrapMode='none'>
				{label}
			</text>
		</box>
	)
}

export function SelectionSection(props: {
	currentField: FocusField
	onAdvance: () => void
	onSearchChange: (value: string) => void
	onSelect: (index: number, option: SelectOption | null) => void
	options: SelectOption[]
	searchField: FocusField
	searchPlaceholder: string
	searchValue: string
	selectField: FocusField
	selectedIndex: number
	selectHeight: number
	title: string
}): ReactNode {
	const active = props.currentField === props.searchField || props.currentField === props.selectField

	return (
		<SearchSelectInput
			configureInput={configureSearchField}
			onCommit={props.onAdvance}
			onSearchChange={props.onSearchChange}
			onSelect={props.onSelect}
			options={props.options}
			placeholder={props.searchPlaceholder}
			searchFocused={props.currentField === props.searchField}
			searchValue={props.searchValue}
			selectEmphasized={active}
			selectedIndex={props.selectedIndex}
			selectFocused={props.currentField === props.selectField}
			selectHeight={getMultilineSelectHeight(props.options.length, props.selectHeight)}
			showScrollIndicator={props.options.length > 3}
			title={props.title}
			titleActive={active}
		/>
	)
}

export function PresetSection({
	currentField,
	explanation,
	field,
	onAdvance,
	onSelect,
	options,
	selectedIndex,
	title
}: {
	currentField: FocusField
	explanation: string
	field: FocusField
	onAdvance: () => void
	onSelect: (value: string) => void
	options: SelectOption[]
	selectedIndex: number
	title: string
}): ReactNode {
	const active = currentField === field

	return (
		<box
			flexDirection='column'
			gap={1}>
			<SectionTitle
				active={active}
				label={title}
			/>
			<SectionExplanation
				active={active}
				text={explanation}
			/>
			<SelectField
				active={active}
				currentField={currentField}
				field={field}
				height={Math.max(3, Math.min(5, options.length + 1))}
				onCommit={onAdvance}
				onSelect={(_, option) => {
					if (typeof option?.value === 'string') {
						onSelect(option.value)
					}
				}}
				options={options}
				selectedIndex={selectedIndex}
			/>
		</box>
	)
}

function SummarySegment({ label, value }: { label: string; value: string }): ReactNode {
	return (
		<box
			flexDirection='row'
			gap={1}>
			<text
				fg={THEME.summaryAccent}
				selectable={false}
				wrapMode='none'>
				{label}
			</text>
			<text
				fg={THEME.offWhite}
				selectable={false}
				wrapMode='none'>
				{value}
			</text>
		</box>
	)
}

export function SoftInput({
	active,
	onChange,
	placeholder,
	value
}: {
	active: boolean
	onChange: (value: string) => void
	placeholder: string
	value: string
}): ReactNode {
	return (
		<AppInput
			configureInput={configureShortcutFriendlyField}
			focused={active}
			onChange={onChange}
			placeholder={placeholder}
			value={value}
		/>
	)
}

function SelectField({
	active = false,
	currentField,
	field,
	height,
	onCommit,
	onSelect,
	options,
	selectedIndex
}: {
	active?: boolean
	currentField: FocusField
	field: FocusField
	height: number
	onCommit: () => void
	onSelect: (index: number, option: SelectOption | null) => void
	options: SelectOption[]
	selectedIndex: number
}): ReactNode {
	return (
		<AppSelect
			emphasized={active}
			focused={currentField === field}
			height={height}
			onCommit={onCommit}
			onSelect={onSelect}
			options={options}
			selectedIndex={selectedIndex}
		/>
	)
}

export function SectionTitle({ active = false, label }: { active?: boolean; label: string }): ReactNode {
	return (
		<text
			fg={active ? THEME.focusAccent : THEME.offWhite}
			selectable={false}>
			<strong>{label}</strong>
		</text>
	)
}

export function SectionExplanation({ active = false, text }: { active?: boolean; text: string }): ReactNode {
	return (
		<text
			fg={active ? THEME.offWhite : THEME.muted}
			selectable={false}>
			{text}
		</text>
	)
}

export function FieldLabel({ active, label }: { active: boolean; label: string }): ReactNode {
	return (
		<text
			fg={active ? THEME.focusAccent : THEME.muted}
			selectable={false}>
			<strong>{label}</strong>
		</text>
	)
}
