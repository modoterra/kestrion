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
	allowFreeform: boolean
): ToolQuestionAnswer | null {
	const typedAnswer = draft.trim()
	if (allowFreeform && typedAnswer) {
		return { answer: typedAnswer, source: 'freeform' }
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
