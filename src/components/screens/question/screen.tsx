import type { InputRenderable, SelectOption, SelectRenderable } from '@opentui/core'
import { useTerminalDimensions } from '@opentui/react'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'

import type { ToolQuestionAnswer, ToolQuestionOption, ToolQuestionPrompt } from '../../../lib/tools/tool-types'
import { RHYTHM, THEME } from '../../../lib/ui/constants'
import { useKeyboardHandler } from '../../../lib/ui/keyboard'
import { AppInput, AppSelect } from '../../ui/forms/controls'
import { StackViewFrame } from '../../ui/layout/stack-view-frame'
import { configureQuestionInput, configureQuestionSelect, resolveAnswer, wrapIndex } from './screen-utils'

type QuestionScreenProps = { onAnswer: (answer: ToolQuestionAnswer) => void; question: ToolQuestionPrompt }

type QuestionBindings = {
	allowFreeform: boolean
	draft: string
	options: SelectOption[]
	selectHeight: number
	selectedIndex: number
	setDraft: (value: string) => void
	setSelectedIndex: (value: number) => void
}

export function QuestionScreen({ onAnswer, question }: QuestionScreenProps): ReactNode {
	const inputRef = useRef<InputRenderable | null>(null)
	const selectRef = useRef<SelectRenderable | null>(null)
	const bindings = useQuestionBindings(question)

	useQuestionFocus(bindings.allowFreeform, inputRef, selectRef)
	useQuestionKeyboard(bindings, onAnswer, question)

	return (
		<StackViewFrame
			breadcrumb={['main', 'question']}
			title={question.title?.trim() || 'Question'}>
			<box
				flexDirection='column'
				flexGrow={1}
				gap={RHYTHM.section}>
				<QuestionHeader question={question} />
				{bindings.allowFreeform ? (
					<QuestionFreeformSection
						draft={bindings.draft}
						inputRef={inputRef}
						onAnswer={onAnswer}
						onChange={bindings.setDraft}
						question={question}
						selectedIndex={bindings.selectedIndex}
						selectOption={question.options?.[bindings.selectedIndex]}
						selectedOption={bindings.options[bindings.selectedIndex]}
					/>
				) : null}
				{bindings.options.length > 0 ? (
					<QuestionOptionsSection
						allowFreeform={bindings.allowFreeform}
						options={bindings.options}
						selectHeight={bindings.selectHeight}
						selectRef={selectRef}
						selectedIndex={bindings.selectedIndex}
						setSelectedIndex={bindings.setSelectedIndex}
					/>
				) : null}
			</box>
		</StackViewFrame>
	)
}

function useQuestionBindings(question: ToolQuestionPrompt): QuestionBindings {
	const { height } = useTerminalDimensions()
	const [draft, setDraft] = useState('')
	const [selectedIndex, setSelectedIndex] = useState(0)
	const options = useMemo<SelectOption[]>(
		() =>
			(question.options ?? []).map(option => ({
				description: option.description ?? '',
				name: option.label,
				value: option.value
			})),
		[question.options]
	)

	return {
		allowFreeform: question.allowFreeform ?? false,
		draft,
		options,
		selectHeight: Math.max(4, Math.min(options.length + 1, Math.max(4, height - 18))),
		selectedIndex,
		setDraft,
		setSelectedIndex
	}
}

function useQuestionFocus(
	allowFreeform: boolean,
	inputRef: { current: InputRenderable | null },
	selectRef: { current: SelectRenderable | null }
): void {
	useEffect(() => {
		setTimeout(() => {
			if (allowFreeform) {
				inputRef.current?.focus()
				return
			}

			selectRef.current?.focus()
		}, 1)
	}, [allowFreeform, inputRef, selectRef])
}

function useQuestionKeyboard(
	bindings: QuestionBindings,
	onAnswer: (answer: ToolQuestionAnswer) => void,
	question: ToolQuestionPrompt
): void {
	useKeyboardHandler(key => {
		if (key.defaultPrevented) {
			return
		}

		if ((key.name === 'up' || key.name === 'down') && bindings.options.length > 0) {
			const delta = key.name === 'up' ? -1 : 1
			bindings.setSelectedIndex(wrapIndex(bindings.selectedIndex + delta, bindings.options.length))
			key.preventDefault()
			key.stopPropagation()
			return
		}

		if (key.name === 'return' || key.name === 'enter') {
			submitQuestionAnswer(bindings, onAnswer, question)
			key.preventDefault()
			key.stopPropagation()
		}
	})
}

function QuestionHeader({ question }: { question: ToolQuestionPrompt }): ReactNode {
	return (
		<box
			flexDirection='column'
			gap={RHYTHM.stack}>
			<text
				fg={THEME.summaryAccent}
				selectable={false}>
				<strong>{question.title?.trim() || 'Question'}</strong>
			</text>
			<text
				fg={THEME.offWhite}
				selectable={false}>
				{question.prompt}
			</text>
		</box>
	)
}

function QuestionFreeformSection({
	draft,
	inputRef,
	onAnswer,
	onChange,
	question,
	selectedIndex,
	selectedOption,
	selectOption
}: {
	draft: string
	inputRef: { current: InputRenderable | null }
	onAnswer: (answer: ToolQuestionAnswer) => void
	onChange: (value: string) => void
	question: ToolQuestionPrompt
	selectedIndex: number
	selectedOption: SelectOption | undefined
	selectOption: ToolQuestionOption | undefined
}): ReactNode {
	return (
		<box
			flexDirection='column'
			gap={1}>
			<text
				fg={THEME.muted}
				selectable={false}>
				Type an answer and press enter.
			</text>
			<AppInput
				configureInput={renderable => configureQuestionInput(inputRef, renderable)}
				focused
				onChange={onChange}
				onSubmit={() => {
					const answer = resolveAnswer(draft, selectedOption, selectOption, true)
					if (answer) {
						onAnswer(answer)
					}
				}}
				placeholder={question.placeholder ?? 'Type your answer'}
				value={draft}
			/>
			<text
				fg={THEME.muted}
				selectable={false}>
				Selected option: {question.options?.[selectedIndex]?.label ?? 'none'}
			</text>
		</box>
	)
}

function QuestionOptionsSection({
	allowFreeform,
	options,
	selectHeight,
	selectRef,
	selectedIndex,
	setSelectedIndex
}: {
	allowFreeform: boolean
	options: SelectOption[]
	selectHeight: number
	selectRef: { current: SelectRenderable | null }
	selectedIndex: number
	setSelectedIndex: (value: number) => void
}): ReactNode {
	return (
		<box
			flexDirection='column'
			gap={1}>
			<text
				fg={THEME.muted}
				selectable={false}>
				Use arrows to choose an option, then press enter.
			</text>
			<AppSelect
				configureSelect={renderable => configureQuestionSelect(selectRef, renderable)}
				emphasized
				focused={!allowFreeform}
				height={selectHeight}
				onSelect={(index): void => {
					setSelectedIndex(index)
				}}
				options={options}
				selectedIndex={selectedIndex}
				showScrollIndicator={options.length > selectHeight}
			/>
		</box>
	)
}

function submitQuestionAnswer(
	bindings: QuestionBindings,
	onAnswer: (answer: ToolQuestionAnswer) => void,
	question: ToolQuestionPrompt
): void {
	const answer = resolveAnswer(
		bindings.draft,
		bindings.options[bindings.selectedIndex],
		question.options?.[bindings.selectedIndex],
		bindings.allowFreeform
	)
	if (!answer) {
		return
	}

	onAnswer(answer)
}
