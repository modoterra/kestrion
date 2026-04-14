import type { SelectOption } from '@opentui/core'
import { useTerminalDimensions } from '@opentui/react'
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'

import {
	type ProviderConfigDerivedState,
	useProviderConfigDerivedState
} from '../../../lib/provider-config/derived-state'
import { type ProviderDraft, type ProviderTabId } from '../../../lib/provider-config/fields'
import {
	advanceProviderWizardGroup,
	clearProviderError,
	resetProviderConfigStore,
	updateProviderDraftField,
	updateProviderModelQuery,
	updateProviderSelection,
	updateSelectedModelSelection
} from '../../../lib/provider-config/state-helpers'
import type { FocusField } from '../../../lib/provider-config/types'
import { getInitialProviderId, getSteps } from '../../../lib/provider-config/utils'
import type { ProviderModelRecord } from '../../../lib/types'

type DraftValueField = Exclude<keyof ProviderDraft, 'providerId'>
type ProviderConfigSteps = ReturnType<typeof getSteps>
type ProviderConfigStep = ProviderConfigSteps[number]

export type ProviderConfigState = {
	activeProviderId: ProviderTabId
	activeProviderIndex: number
	advanceWizardGroup: () => void
	clearError: () => void
	currentField: FocusField
	currentStep: ReturnType<typeof getSteps>[number]
	draft: ProviderDraft
	error: string | null
	filteredProviderOptions: SelectOption[]
	focusFields: FocusField[]
	formHeight: number
	maxTokenIndex: number
	maxTokenOptions: SelectOption[]
	modelOptions: SelectOption[]
	modelQuery: string
	promptTruncateIndex: number
	promptTruncateOptions: SelectOption[]
	providerQuery: string
	selectedModelIndex: number
	setError: (error: string | null) => void
	setFocusIndex: Dispatch<SetStateAction<number>>
	setStepIndex: Dispatch<SetStateAction<number>>
	steps: ReturnType<typeof getSteps>
	temperatureIndex: number
	temperatureOptions: SelectOption[]
	updateDraftField: (field: DraftValueField, value: string) => void
	updateModelQuery: (value: string) => void
	updateProvider: (providerId: ProviderTabId) => void
	updateProviderQuery: (value: string) => void
	updateSelectedModel: (model: string) => void
	resetToInitial: () => void
}

export function useProviderConfigState(
	fireworksModels: ProviderModelRecord[],
	initialDraft: ProviderDraft
): ProviderConfigState {
	const store = useProviderConfigStore(initialDraft)
	const steps = useMemo(() => getSteps(store.activeProviderId), [store.activeProviderId])
	const derived = useProviderConfigDerivedState({ ...store, fireworksModels, steps })

	useProviderConfigFocusSync(
		store.focusIndex,
		derived.currentStep,
		derived.focusFields,
		store.setFocusIndex,
		store.setStepIndex,
		steps
	)

	return buildProviderConfigState(store, derived, steps, useProviderConfigActions(store, derived, initialDraft, steps))
}

function useProviderConfigStore(initialDraft: ProviderDraft): {
	activeProviderId: ProviderTabId
	draft: ProviderDraft
	error: string | null
	focusIndex: number
	formHeight: number
	modelQuery: string
	providerQuery: string
	setActiveProviderId: Dispatch<SetStateAction<ProviderTabId>>
	setDraft: Dispatch<SetStateAction<ProviderDraft>>
	setError: Dispatch<SetStateAction<string | null>>
	setFocusIndex: Dispatch<SetStateAction<number>>
	setModelQuery: Dispatch<SetStateAction<string>>
	setProviderQuery: Dispatch<SetStateAction<string>>
	setStepIndex: Dispatch<SetStateAction<number>>
	stepIndex: number
} {
	const { height } = useTerminalDimensions()
	const [draft, setDraft] = useState(initialDraft)
	const [error, setError] = useState<string | null>(null)
	const [providerQuery, setProviderQuery] = useState('')
	const [modelQuery, setModelQuery] = useState('')
	const [activeProviderId, setActiveProviderId] = useState<ProviderTabId>(getInitialProviderId(initialDraft))
	const [stepIndex, setStepIndex] = useState(0)
	const [focusIndex, setFocusIndex] = useState(0)

	return {
		activeProviderId,
		draft,
		error,
		focusIndex,
		formHeight: Math.max(12, height - 18),
		modelQuery,
		providerQuery,
		setActiveProviderId,
		setDraft,
		setError,
		setFocusIndex,
		setModelQuery,
		setProviderQuery,
		setStepIndex,
		stepIndex
	}
}

function useProviderConfigActions(
	store: ReturnType<typeof useProviderConfigStore>,
	derived: ProviderConfigDerivedState,
	initialDraft: ProviderDraft,
	steps: ProviderConfigSteps
): {
	advanceWizardGroup: () => void
	clearError: () => void
	resetToInitial: () => void
	updateDraftField: (field: DraftValueField, value: string) => void
	updateModelQuery: (value: string) => void
	updateProvider: (providerId: ProviderTabId) => void
	updateSelectedModel: (model: string) => void
} {
	const clearError = (): void => clearProviderError(store.error, store.setError)
	const updateDraftField = (field: DraftValueField, value: string): void =>
		updateProviderDraftField(store.setDraft, clearError, field, value)
	const updateProvider = (providerId: ProviderTabId): void =>
		updateProviderSelection(store.setActiveProviderId, store.setProviderQuery, clearError, providerId)
	const updateSelectedModel = (model: string): void =>
		updateSelectedModelSelection(store.setDraft, store.setModelQuery, clearError, model)
	const updateModelQuery = (value: string): void =>
		updateProviderModelQuery(store.activeProviderId, store.setDraft, store.setModelQuery, value)
	const advanceWizardGroup = (): void =>
		advanceProviderWizardGroup(derived, store.setFocusIndex, store.setStepIndex, store.stepIndex, steps)
	const resetToInitial = (): void =>
		resetProviderConfigStore(
			initialDraft,
			store.setActiveProviderId,
			store.setDraft,
			store.setError,
			store.setFocusIndex,
			store.setModelQuery,
			store.setProviderQuery,
			store.setStepIndex
		)

	return {
		advanceWizardGroup,
		clearError,
		resetToInitial,
		updateDraftField,
		updateModelQuery,
		updateProvider,
		updateSelectedModel
	}
}

function buildProviderConfigState(
	store: ReturnType<typeof useProviderConfigStore>,
	derived: ProviderConfigDerivedState,
	steps: ProviderConfigSteps,
	actions: ReturnType<typeof useProviderConfigActions>
): ProviderConfigState {
	return {
		activeProviderId: store.activeProviderId,
		activeProviderIndex: derived.activeProviderIndex,
		advanceWizardGroup: actions.advanceWizardGroup,
		clearError: actions.clearError,
		currentField: derived.currentField,
		currentStep: derived.currentStep,
		draft: store.draft,
		error: store.error,
		filteredProviderOptions: derived.filteredProviderOptions,
		focusFields: derived.focusFields,
		formHeight: store.formHeight,
		maxTokenIndex: derived.maxTokenIndex,
		maxTokenOptions: derived.maxTokenOptions,
		modelOptions: derived.modelOptions,
		modelQuery: store.modelQuery,
		promptTruncateIndex: derived.promptTruncateIndex,
		promptTruncateOptions: derived.promptTruncateOptions,
		providerQuery: store.providerQuery,
		resetToInitial: actions.resetToInitial,
		selectedModelIndex: derived.selectedModelIndex,
		setError: store.setError,
		setFocusIndex: store.setFocusIndex,
		setStepIndex: store.setStepIndex,
		steps,
		temperatureIndex: derived.temperatureIndex,
		temperatureOptions: derived.temperatureOptions,
		updateDraftField: actions.updateDraftField,
		updateModelQuery: actions.updateModelQuery,
		updateProvider: actions.updateProvider,
		updateProviderQuery: store.setProviderQuery,
		updateSelectedModel: actions.updateSelectedModel
	}
}

function useProviderConfigFocusSync(
	focusIndex: number,
	currentStep: ProviderConfigStep,
	focusFields: FocusField[],
	setFocusIndex: Dispatch<SetStateAction<number>>,
	setStepIndex: Dispatch<SetStateAction<number>>,
	steps: ProviderConfigSteps
): void {
	useEffect(() => {
		if (steps.length <= 0) {
			return
		}

		setStepIndex(value => Math.min(value, Math.max(0, steps.length - 1)))
	}, [setStepIndex, steps])

	useEffect(() => {
		setFocusIndex(0)
	}, [currentStep, setFocusIndex])

	useEffect(() => {
		if (focusIndex < focusFields.length) {
			return
		}

		setFocusIndex(Math.max(0, focusFields.length - 1))
	}, [focusFields, focusIndex, setFocusIndex])
}
