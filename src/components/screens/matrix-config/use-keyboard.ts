import type { Dispatch, SetStateAction } from 'react'

import type { MatrixDraft } from '../../../lib/matrix-config/fields'
import type { MatrixFocusField, MatrixSelectField, MatrixStepId } from '../../../lib/matrix-config/types'
import { isMatrixSelectField, moveMatrixOptionValue, MATRIX_STEPS } from '../../../lib/matrix-config/utils'
import { useKeyboardHandler } from '../../../lib/ui/keyboard'

type MatrixConfigKeyboardArgs = {
	advanceWizardGroup: () => void
	currentField: MatrixFocusField
	currentStep: MatrixStepId
	draft: MatrixDraft
	focusFieldCount: number
	onReset: () => void
	onSave: (draft: MatrixDraft) => Promise<string | null>
	popView: () => void
	resetToInitial: () => void
	setError: (error: string | null) => void
	setFocusIndex: Dispatch<SetStateAction<number>>
	setStepIndex: Dispatch<SetStateAction<number>>
	updateSelectField: (field: MatrixSelectField, value: string) => void
}

export function useMatrixConfigKeyboard(args: MatrixConfigKeyboardArgs): void {
	useKeyboardHandler(key => {
		handleMatrixConfigKey(key, args)
	})
}

function handleMatrixConfigKey(
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
	args: MatrixConfigKeyboardArgs
): void {
	if (handleStepCyclingKey(key, args.currentField, args.setStepIndex)) {
		return
	}

	if (handleSelectionNavigationKey(key, args.currentField, args.draft, args.updateSelectField)) {
		return
	}

	if (handleSubmitKey(key, args.currentField, args.advanceWizardGroup)) {
		return
	}

	if (handleMatrixCommandKey(key, args)) {
		return
	}

	handleFocusTabKey(key, args.focusFieldCount, args.setFocusIndex)
}

function handleMatrixCommandKey(
	key: { ctrl?: boolean; name: string; preventDefault: () => void; stopPropagation: () => void },
	args: MatrixConfigKeyboardArgs
): boolean {
	if (!key.ctrl) {
		return false
	}

	if (key.name === 's') {
		if (args.currentStep !== 'preview') {
			args.setStepIndex(MATRIX_STEPS.length - 1)
			args.setFocusIndex(0)
			preventKeyboardEvent(key)
			return true
		}

		void args.onSave(args.draft).then(nextError => {
			if (nextError) {
				return args.setError(nextError)
			}

			return args.popView()
		})

		preventKeyboardEvent(key)
		return true
	}

	if (key.name === 'r') {
		args.resetToInitial()
		args.onReset()
		preventKeyboardEvent(key)
		return true
	}

	return false
}

function handleStepCyclingKey(
	key: { name: string; raw?: string; sequence?: string; preventDefault: () => void; stopPropagation: () => void },
	currentField: MatrixFocusField,
	setStepIndex: Dispatch<SetStateAction<number>>
): boolean {
	if (currentField === 'customInstructions') {
		return false
	}

	const direction =
		key.name === 'left' || key.raw === '[' || key.sequence === '['
			? -1
			: key.name === 'right' || key.raw === ']' || key.sequence === ']'
				? 1
				: 0
	if (direction === 0) {
		return false
	}

	setStepIndex(value => (value + direction + MATRIX_STEPS.length) % MATRIX_STEPS.length)
	preventKeyboardEvent(key)
	return true
}

function handleSelectionNavigationKey(
	key: { name: string; preventDefault: () => void; stopPropagation: () => void },
	currentField: MatrixFocusField,
	draft: MatrixDraft,
	updateSelectField: (field: MatrixSelectField, value: string) => void
): boolean {
	if (!isMatrixSelectField(currentField) || (key.name !== 'up' && key.name !== 'down')) {
		return false
	}

	const direction = key.name === 'up' ? -1 : 1
	const nextValue = moveMatrixOptionValue(currentField, draft[currentField], direction)
	updateSelectField(currentField, nextValue)
	preventKeyboardEvent(key)
	return true
}

function handleSubmitKey(
	key: { name: string; preventDefault: () => void; stopPropagation: () => void },
	currentField: MatrixFocusField,
	advanceWizardGroup: () => void
): boolean {
	if (currentField === 'customInstructions' || currentField === 'preview') {
		return false
	}

	if (key.name !== 'enter' && key.name !== 'return' && key.name !== 'linefeed') {
		return false
	}

	advanceWizardGroup()
	preventKeyboardEvent(key)
	return true
}

function handleFocusTabKey(
	key: { name: string; preventDefault: () => void; shift?: boolean; stopPropagation: () => void },
	focusFieldCount: number,
	setFocusIndex: Dispatch<SetStateAction<number>>
): void {
	if (key.name !== 'tab' || focusFieldCount <= 0) {
		return
	}

	setFocusIndex(value => (value + (key.shift ? -1 : 1) + focusFieldCount) % focusFieldCount)
	preventKeyboardEvent(key)
}

function preventKeyboardEvent(key: { preventDefault: () => void; stopPropagation: () => void }): void {
	key.preventDefault()
	key.stopPropagation()
}
