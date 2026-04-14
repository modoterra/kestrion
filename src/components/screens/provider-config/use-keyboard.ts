import type { Dispatch, SetStateAction } from 'react'

import type { ProviderDraft, ProviderTabId } from '../../../lib/provider-config/fields'
import type { FocusField } from '../../../lib/provider-config/types'
import {
	buildDraftForSave,
	cycleIndex,
	isSubmitKey,
	isTextInputField,
	moveOptionIndex
} from '../../../lib/provider-config/utils'
import { useKeyboardHandler } from '../../../lib/ui/keyboard'

type SelectOptionValue = { value?: string | number | null }
type ProviderConfigKeyboardArgs = {
	activeProviderId: ProviderTabId
	advanceWizardGroup: () => void
	currentField: FocusField
	draft: ProviderDraft
	filteredProviderOptions: SelectOptionValue[]
	focusFieldCount: number
	modelOptions: SelectOptionValue[]
	onReset: () => void
	onSave: (draft: ProviderDraft) => string | null
	popView: () => void
	resetToInitial: () => void
	selectedModelIndex: number
	selectModel: (model: string) => void
	selectProvider: (providerId: ProviderTabId) => void
	setError: (error: string | null) => void
	setFocusIndex: Dispatch<SetStateAction<number>>
	setStepIndex: Dispatch<SetStateAction<number>>
	stepCount: number
}

export function useProviderConfigKeyboard(args: ProviderConfigKeyboardArgs): void {
	useKeyboardHandler(key => {
		handleProviderConfigKey(key, args)
	})
}

function handleProviderConfigKey(
	key: {
		ctrl?: boolean
		defaultPrevented?: boolean
		name: string
		preventDefault: () => void
		raw?: string
		sequence?: string
		shift?: boolean
		stopPropagation: () => void
	},
	args: ProviderConfigKeyboardArgs
): void {
	if (handleStepCyclingKey(key, args.currentField, args.setStepIndex, args.stepCount)) {
		return
	}

	if (handleSelectionNavigationKey(key, args)) {
		return
	}

	if (handleSubmitKey(key, args.currentField, args.advanceWizardGroup)) {
		return
	}

	if (handleProviderCommandKey(key, args)) {
		return
	}

	handleFocusTabKey(key, args.focusFieldCount, args.setFocusIndex)
}

function handleSelectionNavigationKey(
	key: {
		defaultPrevented?: boolean
		name: string
		preventDefault: () => void
		raw?: string
		sequence?: string
		stopPropagation: () => void
	},
	args: ProviderConfigKeyboardArgs
): boolean {
	return (
		handleProviderNavigationKey(
			key,
			args.currentField,
			args.filteredProviderOptions,
			args.selectProvider,
			args.setError
		) ||
		handleModelNavigationKey(
			key,
			args.currentField,
			args.modelOptions,
			args.selectedModelIndex,
			args.selectModel,
			args.setError
		)
	)
}

function handleProviderCommandKey(
	key: { ctrl?: boolean; name: string; preventDefault: () => void; stopPropagation: () => void },
	args: ProviderConfigKeyboardArgs
): boolean {
	return handleSaveOrResetKey(
		key,
		args.activeProviderId,
		args.draft,
		args.onSave,
		args.onReset,
		args.popView,
		args.resetToInitial,
		args.setError
	)
}

function handleFocusTabKey(
	key: { name: string; preventDefault: () => void; shift?: boolean; stopPropagation: () => void },
	focusFieldCount: number,
	setFocusIndex: Dispatch<SetStateAction<number>>
): void {
	if (key.name !== 'tab') {
		return
	}

	setFocusIndex(value => cycleIndex(value, key.shift ? -1 : 1, focusFieldCount))
	preventKeyboardEvent(key)
}

function handleStepCyclingKey(
	key: { name: string; raw?: string; sequence?: string; preventDefault: () => void; stopPropagation: () => void },
	currentField: FocusField,
	setStepIndex: Dispatch<SetStateAction<number>>,
	stepCount: number
): boolean {
	if (preventsStepCycling(currentField)) {
		return false
	}

	const direction =
		key.name === 'left' || key.raw === '[' || key.sequence === '['
			? -1
			: key.name === 'right' || key.raw === ']' || key.sequence === ']'
				? 1
				: 0
	if (direction === 0 || stepCount <= 0) {
		return false
	}

	setStepIndex(value => cycleIndex(value, direction, stepCount))
	preventKeyboardEvent(key)
	return true
}

function preventsStepCycling(currentField: FocusField): boolean {
	return isTextInputField(currentField) && currentField !== 'providerSearch' && currentField !== 'modelSearch'
}

function handleProviderNavigationKey(
	key: { name: string; preventDefault: () => void; stopPropagation: () => void },
	currentField: FocusField,
	options: SelectOptionValue[],
	selectProvider: (providerId: ProviderTabId) => void,
	setError: (error: string | null) => void
): boolean {
	if (currentField !== 'providerSearch' || (key.name !== 'up' && key.name !== 'down')) {
		return false
	}

	const direction = key.name === 'up' ? -1 : 1
	const nextValue = options[moveOptionIndex(0, options.length, direction)]?.value
	if (typeof nextValue === 'string') {
		selectProvider(nextValue as ProviderTabId)
		setError(null)
	}

	preventKeyboardEvent(key)
	return true
}

function handleSubmitKey(
	key: { name: string; raw?: string; sequence?: string; preventDefault: () => void; stopPropagation: () => void },
	currentField: FocusField,
	advanceWizardGroup: () => void
): boolean {
	if (!isTextInputField(currentField) || !isSubmitKey(key)) {
		return false
	}

	advanceWizardGroup()
	preventKeyboardEvent(key)
	return true
}

function handleSaveOrResetKey(
	key: { ctrl?: boolean; name: string; preventDefault: () => void; stopPropagation: () => void },
	activeProviderId: ProviderTabId,
	draft: ProviderDraft,
	onSave: (draft: ProviderDraft) => string | null,
	onReset: () => void,
	popView: () => void,
	resetToInitial: () => void,
	setError: (error: string | null) => void
): boolean {
	if (!key.ctrl) {
		return false
	}

	if (key.name === 's') {
		const nextError = onSave(buildDraftForSave(activeProviderId, draft))
		if (nextError) {
			setError(nextError)
		} else {
			popView()
		}

		preventKeyboardEvent(key)
		return true
	}

	if (key.name === 'r') {
		resetToInitial()
		onReset()
		preventKeyboardEvent(key)
		return true
	}

	if (key.name === 'p') {
		popView()
		preventKeyboardEvent(key)
		return true
	}

	return false
}

function handleModelNavigationKey(
	key: { name: string; defaultPrevented?: boolean; preventDefault: () => void; stopPropagation: () => void },
	currentField: FocusField,
	options: SelectOptionValue[],
	selectedModelIndex: number,
	selectModel: (model: string) => void,
	setError: (error: string | null) => void
): boolean {
	if (key.defaultPrevented || currentField !== 'modelSearch' || (key.name !== 'up' && key.name !== 'down')) {
		return false
	}

	const direction = key.name === 'up' ? -1 : 1
	const nextValue = options[moveOptionIndex(selectedModelIndex, options.length, direction)]?.value
	if (typeof nextValue === 'string') {
		selectModel(nextValue)
		setError(null)
	}

	preventKeyboardEvent(key)
	return true
}

function preventKeyboardEvent(key: { preventDefault: () => void; stopPropagation: () => void }): void {
	key.preventDefault()
	key.stopPropagation()
}
