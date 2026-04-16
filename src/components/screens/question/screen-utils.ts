import type { InputRenderable, SelectOption, SelectRenderable } from '@opentui/core'

import type { ToolQuestionAnswer, ToolQuestionOption } from '../../../lib/tools/tool-types'
import { configureShortcutFriendlyField } from '../../../lib/ui/helpers'

export function configureQuestionInput(
	inputRef: { current: InputRenderable | null },
	renderable: InputRenderable | null
): void {
	inputRef.current = renderable
	configureShortcutFriendlyField(renderable)
}

export function configureQuestionSelect(
	selectRef: { current: SelectRenderable | null },
	renderable: SelectRenderable | null
): void {
	selectRef.current = renderable
	configureShortcutFriendlyField(renderable)
}

export function resolveAnswer(
	draft: string,
	selectedOption: SelectOption | undefined,
	questionOption: ToolQuestionOption | undefined,
	allowFreeform: boolean,
	freeformOptionValue?: string
): ToolQuestionAnswer | null {
	const typedAnswer = draft.trim()
	const selectedValue = typeof questionOption?.value === 'string' ? questionOption.value : undefined
	const freeformEnabledForSelection = !freeformOptionValue || selectedValue === freeformOptionValue

	if (allowFreeform && typedAnswer && freeformEnabledForSelection) {
		return { answer: typedAnswer, source: 'freeform' }
	}

	if (allowFreeform && freeformOptionValue && selectedValue === freeformOptionValue) {
		return null
	}

	if (!selectedOption || !questionOption) {
		return null
	}

	return {
		answer: String(selectedOption.value),
		optionLabel: questionOption.label,
		optionValue: questionOption.value,
		source: 'option'
	}
}

export function wrapIndex(index: number, optionCount: number): number {
	return (index + optionCount) % optionCount
}
