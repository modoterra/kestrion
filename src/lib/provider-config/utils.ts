import type { InputRenderable, SelectOption } from '@opentui/core'

import type { ProviderModelRecord } from '../types'
import {
	FIREWORKS_BASE_URL,
	type ProviderDraft,
	type ProviderTabId,
	PROVIDER_TABS,
	TEMPERATURE_PRESETS
} from './fields'
import type { FocusField, StepId } from './types'

export function getSteps(providerId: ProviderTabId): StepId[] {
	return providerId === 'custom'
		? ['provider', 'model', 'limits', 'credentials', 'advanced']
		: ['provider', 'model', 'limits', 'credentials']
}

export function getStepFocusFields(step: StepId): FocusField[] {
	switch (step) {
		case 'provider':
			return ['providerSearch', 'providerSelect']
		case 'model':
			return ['modelSearch', 'modelSelect']
		case 'limits':
			return [
				'maxTokens',
				'promptTruncateLength',
				'compactTailTurns',
				'compactAutoTurnThreshold',
				'compactAutoPromptChars',
				'temperature'
			]
		case 'credentials':
			return ['apiKey', 'apiKeyEnv']
		case 'advanced':
			return ['baseUrl']
	}
}

export function getStepFocusGroups(step: StepId): FocusField[][] {
	switch (step) {
		case 'provider':
			return [['providerSearch', 'providerSelect']]
		case 'model':
			return [['modelSearch', 'modelSelect']]
		case 'limits':
			return [
				['maxTokens'],
				['promptTruncateLength'],
				['compactTailTurns'],
				['compactAutoTurnThreshold'],
				['compactAutoPromptChars'],
				['temperature']
			]
		case 'credentials':
			return [['apiKey'], ['apiKeyEnv']]
		case 'advanced':
			return [['baseUrl']]
	}
}

export function buildModelOptions(
	providerId: ProviderTabId,
	currentModel: string,
	query: string,
	fireworksModels: ProviderModelRecord[]
): SelectOption[] {
	if (providerId === 'custom') {
		const candidate = (query.trim() || currentModel).trim()
		return candidate
			? [{ description: 'Use this custom model identifier', name: candidate, value: candidate }]
			: [{ description: 'Type a model id above to use it', name: 'No custom model yet', value: '' }]
	}

	const needle = query.trim().toLowerCase()
	const options: SelectOption[] = fireworksModels
		.map(model => ({ description: model.description, name: model.label, value: model.model }))
		.filter(option =>
			needle.length === 0
				? true
				: `${option.name} ${option.description ?? ''} ${option.value}`.toLowerCase().includes(needle)
		)

	if (currentModel && !options.some(option => option.value === currentModel)) {
		options.unshift({
			description: 'Current saved model',
			name: currentModel.split('/').at(-1) ?? currentModel,
			value: currentModel
		})
	}

	return options
}

export function withCurrentValueOption(
	presets: ReadonlyArray<{ description: string; label: string; value: string }>,
	currentValue: string,
	currentDescription: string
): SelectOption[] {
	const options: SelectOption[] = presets.map(preset => ({
		description: preset.description,
		name: preset.label,
		value: preset.value
	}))

	if (currentValue && !options.some(option => option.value === currentValue)) {
		options.unshift({ description: currentDescription, name: currentValue, value: currentValue })
	}

	return options
}

export function getInitialProviderId(draft: ProviderDraft): ProviderTabId {
	if (draft.providerId) {
		return draft.providerId
	}

	return draft.baseUrl.trim() && draft.baseUrl.trim() !== FIREWORKS_BASE_URL ? 'custom' : 'fireworks'
}

export function getProviderSummary(providerId: ProviderTabId): string {
	return PROVIDER_TABS.find(provider => provider.id === providerId)?.description ?? providerId
}

export function getModelSummary(
	providerId: ProviderTabId,
	model: string,
	fireworksModels: ProviderModelRecord[]
): string {
	if (providerId === 'fireworks') {
		const match = fireworksModels.find(option => option.model === model)
		if (match) {
			return match.label
		}
	}

	return model.split('/').at(-1) ?? model
}

export function getTemperatureSummary(value: string): string {
	return TEMPERATURE_PRESETS.find(preset => String(preset.temperature) === value)?.label ?? value
}

export function getStepLabel(step: StepId): string {
	switch (step) {
		case 'provider':
			return 'Provider'
		case 'model':
			return 'Model'
		case 'limits':
			return 'Limits'
		case 'credentials':
			return 'Credentials'
		case 'advanced':
			return 'Advanced'
	}
}

export function isTextInputField(field: FocusField): boolean {
	return (
		field === 'providerSearch' ||
		field === 'modelSearch' ||
		field === 'apiKey' ||
		field === 'apiKeyEnv' ||
		field === 'baseUrl'
	)
}

export function getMultilineSelectHeight(optionCount: number, maxHeight: number): number {
	const visibleOptions = Math.min(Math.max(optionCount, 1), 3)
	return Math.min(maxHeight, visibleOptions * 2)
}

export function cycleIndex(index: number, direction: number, length: number): number {
	return (index + direction + length) % length
}

export function moveOptionIndex(index: number, length: number, direction: number): number {
	if (length <= 0) {
		return 0
	}

	return (index + direction + length) % length
}

export function isSubmitKey(key: { name: string; raw?: string; sequence?: string }): boolean {
	return (
		key.name === 'enter' ||
		key.name === 'return' ||
		key.name === 'linefeed' ||
		key.raw === '\r' ||
		key.sequence === '\r' ||
		key.raw === '\n' ||
		key.sequence === '\n'
	)
}

export function configureSearchField(renderable: InputRenderable | null): void {
	if (!renderable) {
		return
	}

	renderable.traits = { capture: ['escape', 'submit'] }
}

export function buildDraftForSave(activeProviderId: ProviderTabId, draft: ProviderDraft): ProviderDraft {
	return activeProviderId === 'custom'
		? { ...draft, providerId: activeProviderId }
		: { ...draft, baseUrl: FIREWORKS_BASE_URL, providerId: activeProviderId }
}
