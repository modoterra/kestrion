import type { SelectOption } from '@opentui/core'
import { useMemo } from 'react'

import type { ProviderModelRecord } from '../types'
import {
	MAX_TOKEN_PRESETS,
	PROMPT_TRUNCATE_PRESETS,
	type ProviderDraft,
	type ProviderTabId,
	PROVIDER_TABS,
	TEMPERATURE_PRESETS
} from './fields'
import type { FocusField, StepId } from './types'
import { buildModelOptions, getStepFocusFields, getStepFocusGroups, withCurrentValueOption } from './utils'

type ProviderConfigDerivedArgs = {
	activeProviderId: ProviderTabId
	draft: ProviderDraft
	fireworksModels: ProviderModelRecord[]
	focusIndex: number
	modelQuery: string
	providerQuery: string
	stepIndex: number
	steps: StepId[]
}

export type ProviderConfigDerivedState = {
	activeProviderIndex: number
	currentField: FocusField
	currentStep: StepId
	filteredProviderOptions: SelectOption[]
	focusFields: FocusField[]
	focusGroups: FocusField[][]
	maxTokenIndex: number
	maxTokenOptions: SelectOption[]
	modelOptions: SelectOption[]
	promptTruncateIndex: number
	promptTruncateOptions: SelectOption[]
	selectedModelIndex: number
	temperatureIndex: number
	temperatureOptions: SelectOption[]
}

export function useProviderConfigDerivedState(args: ProviderConfigDerivedArgs): ProviderConfigDerivedState {
	const stepState = useProviderConfigStepState(args.focusIndex, args.stepIndex, args.steps)
	const providerState = useProviderOptionState(args.activeProviderId, args.providerQuery)
	const modelState = useProviderModelState(
		args.activeProviderId,
		args.draft.model,
		args.fireworksModels,
		args.modelQuery
	)
	const presetState = useProviderPresetState(args.draft)

	return { ...stepState, ...providerState, ...modelState, ...presetState }
}

function useProviderConfigStepState(
	focusIndex: number,
	stepIndex: number,
	steps: StepId[]
): Pick<ProviderConfigDerivedState, 'currentField' | 'currentStep' | 'focusFields' | 'focusGroups'> {
	const currentStep = steps[stepIndex] ?? steps[0] ?? 'provider'
	const focusFields = useMemo(() => getStepFocusFields(currentStep), [currentStep])
	const focusGroups = useMemo(() => getStepFocusGroups(currentStep), [currentStep])

	return {
		currentField: focusFields[focusIndex] ?? focusFields[0] ?? 'providerSearch',
		currentStep,
		focusFields,
		focusGroups
	}
}

function useProviderOptionState(
	activeProviderId: ProviderTabId,
	providerQuery: string
): Pick<ProviderConfigDerivedState, 'activeProviderIndex' | 'filteredProviderOptions'> {
	const providerOptions = useMemo<SelectOption[]>(
		() =>
			PROVIDER_TABS.map(provider => ({ description: provider.description, name: provider.label, value: provider.id })),
		[]
	)
	const filteredProviderOptions = useMemo(
		() => filterProviderOptions(providerOptions, providerQuery),
		[providerOptions, providerQuery]
	)

	return { activeProviderIndex: findSelectedIndex(filteredProviderOptions, activeProviderId), filteredProviderOptions }
}

function useProviderModelState(
	activeProviderId: ProviderTabId,
	currentModel: string,
	fireworksModels: ProviderModelRecord[],
	modelQuery: string
): Pick<ProviderConfigDerivedState, 'modelOptions' | 'selectedModelIndex'> {
	const modelOptions = useMemo(
		() => buildModelOptions(activeProviderId, currentModel, modelQuery, fireworksModels),
		[activeProviderId, currentModel, fireworksModels, modelQuery]
	)

	return { modelOptions, selectedModelIndex: findSelectedIndex(modelOptions, currentModel) }
}

function useProviderPresetState(
	draft: ProviderDraft
): Pick<
	ProviderConfigDerivedState,
	| 'maxTokenIndex'
	| 'maxTokenOptions'
	| 'promptTruncateIndex'
	| 'promptTruncateOptions'
	| 'temperatureIndex'
	| 'temperatureOptions'
> {
	const maxTokenOptions = useMemo(
		() => withCurrentValueOption(MAX_TOKEN_PRESETS, draft.maxTokens, 'Current saved max tokens'),
		[draft.maxTokens]
	)
	const promptTruncateOptions = useMemo(
		() => withCurrentValueOption(PROMPT_TRUNCATE_PRESETS, draft.promptTruncateLength, 'Current saved truncation'),
		[draft.promptTruncateLength]
	)
	const temperatureOptions = useMemo(
		() => withCurrentValueOption(TEMPERATURE_OPTION_PRESETS, draft.temperature, 'Current saved temperature'),
		[draft.temperature]
	)

	return {
		maxTokenIndex: findSelectedIndex(maxTokenOptions, draft.maxTokens),
		maxTokenOptions,
		promptTruncateIndex: findSelectedIndex(promptTruncateOptions, draft.promptTruncateLength),
		promptTruncateOptions,
		temperatureIndex: findSelectedIndex(temperatureOptions, draft.temperature),
		temperatureOptions
	}
}

function filterProviderOptions(options: SelectOption[], providerQuery: string): SelectOption[] {
	const needle = providerQuery.trim().toLowerCase()
	return needle
		? options.filter(provider => `${provider.name} ${provider.description ?? ''}`.toLowerCase().includes(needle))
		: options
}

function findSelectedIndex(options: SelectOption[], value: string): number {
	return Math.max(
		0,
		options.findIndex(option => option.value === value)
	)
}

const TEMPERATURE_OPTION_PRESETS = TEMPERATURE_PRESETS.map(preset => ({
	description:
		preset.temperature <= 0.2
			? 'Lower creativity and more deterministic output'
			: preset.temperature >= 0.9
				? 'Higher creativity and more varied output'
				: 'Balanced creativity and stability',
	label: preset.label,
	value: String(preset.temperature)
}))
