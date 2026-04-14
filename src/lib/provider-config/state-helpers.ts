import type { Dispatch, SetStateAction } from 'react'

import type { ProviderConfigDerivedState } from './derived-state'
import type { ProviderDraft, ProviderTabId } from './fields'
import type { StepId } from './types'
import { getInitialProviderId } from './utils'

type ProviderConfigSteps = StepId[]
type DraftValueField = Exclude<keyof ProviderDraft, 'providerId'>

export function clearProviderError(error: string | null, setError: Dispatch<SetStateAction<string | null>>): void {
	if (error) {
		setError(null)
	}
}

export function updateProviderDraftField(
	setDraft: Dispatch<SetStateAction<ProviderDraft>>,
	clearError: () => void,
	field: DraftValueField,
	value: string
): void {
	setDraft(current => ({ ...current, [field]: value }))
	clearError()
}

export function updateProviderSelection(
	setActiveProviderId: Dispatch<SetStateAction<ProviderTabId>>,
	setProviderQuery: Dispatch<SetStateAction<string>>,
	clearError: () => void,
	providerId: ProviderTabId
): void {
	setActiveProviderId(providerId)
	setProviderQuery('')
	clearError()
}

export function updateSelectedModelSelection(
	setDraft: Dispatch<SetStateAction<ProviderDraft>>,
	setModelQuery: Dispatch<SetStateAction<string>>,
	clearError: () => void,
	model: string
): void {
	setDraft(current => ({ ...current, model }))
	setModelQuery('')
	clearError()
}

export function updateProviderModelQuery(
	activeProviderId: ProviderTabId,
	setDraft: Dispatch<SetStateAction<ProviderDraft>>,
	setModelQuery: Dispatch<SetStateAction<string>>,
	value: string
): void {
	setModelQuery(value)
	if (activeProviderId === 'custom') {
		setDraft(current => ({ ...current, model: value }))
	}
}

export function advanceProviderWizardGroup(
	derived: ProviderConfigDerivedState,
	setFocusIndex: Dispatch<SetStateAction<number>>,
	setStepIndex: Dispatch<SetStateAction<number>>,
	stepIndex: number,
	steps: ProviderConfigSteps
): void {
	const nextField =
		derived.focusGroups[derived.focusGroups.findIndex(group => group.includes(derived.currentField)) + 1]?.[0]
	if (nextField) {
		const nextFocusIndex = derived.focusFields.indexOf(nextField)
		if (nextFocusIndex >= 0) {
			setFocusIndex(nextFocusIndex)
			return
		}
	}

	if (stepIndex < steps.length - 1) {
		setStepIndex(value => value + 1)
		setFocusIndex(0)
	}
}

export function resetProviderConfigStore(
	initialDraft: ProviderDraft,
	setActiveProviderId: Dispatch<SetStateAction<ProviderTabId>>,
	setDraft: Dispatch<SetStateAction<ProviderDraft>>,
	setError: Dispatch<SetStateAction<string | null>>,
	setFocusIndex: Dispatch<SetStateAction<number>>,
	setModelQuery: Dispatch<SetStateAction<string>>,
	setProviderQuery: Dispatch<SetStateAction<string>>,
	setStepIndex: Dispatch<SetStateAction<number>>
): void {
	setDraft(initialDraft)
	setProviderQuery('')
	setModelQuery('')
	setActiveProviderId(getInitialProviderId(initialDraft))
	setStepIndex(0)
	setFocusIndex(0)
	setError(null)
}
