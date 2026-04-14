import type { InputRenderable, SelectOption } from '@opentui/core'
import { useTerminalDimensions } from '@opentui/react'
import {
	type Dispatch,
	type MutableRefObject,
	type ReactNode,
	type SetStateAction,
	useEffect,
	useMemo,
	useRef,
	useState
} from 'react'

import {
	getNavigationDirection,
	isDeleteAllKey,
	isDeleteCurrentKey,
	preventKeyboardEvent,
	type ViewSelectKeyboardEvent
} from '../../../lib/navigation/view-select-keyboard-utils'
import { configureShortcutFriendlyField } from '../../../lib/ui/helpers'
import { useKeyboardHandler } from '../../../lib/ui/keyboard'
import { SearchSelectInput } from '../forms/search-select-input'
import { StackViewFrame } from '../layout/stack-view-frame'

export type ViewSelectOption<T = string> = { description?: string; title: string; value: T }
type ViewSelectProps<T> = {
	onDeleteAll?: () => void
	onDeleteCurrent?: (option: ViewSelectOption<T>) => void
	onSelect: (option: ViewSelectOption<T>) => void
	options: ViewSelectOption<T>[]
	placeholder?: string
	title: string
}

export function ViewSelect<T>(props: ViewSelectProps<T>): ReactNode {
	const { onDeleteAll, onDeleteCurrent, onSelect, options, placeholder = 'Search', title } = props
	const { height } = useTerminalDimensions()
	const inputRef = useRef<InputRenderable | null>(null)
	const [query, setQuery] = useState('')
	const [selectedIndex, setSelectedIndex] = useState(0)
	const filteredOptions = useFilteredOptions(options, query)
	const selectOptions = useSelectOptions(filteredOptions)
	const listHeight = Math.max(10, height - 15)
	const selectCurrentOption = (): void => selectViewOption(filteredOptions, selectedIndex, onSelect)

	useBoundSelectedIndex(query, filteredOptions.length, selectedIndex, setSelectedIndex)
	useAutoFocusInput(inputRef)
	useViewSelectKeyboard({
		filteredOptions,
		onDeleteAll,
		onDeleteCurrent,
		onSelectCurrent: selectCurrentOption,
		selectedIndex,
		setSelectedIndex
	})

	return (
		<StackViewFrame title={title}>
			<box
				flexDirection='column'
				flexGrow={1}
				minHeight={0}>
				<SearchSelectInput
					configureInput={renderable => configureSearchInput(inputRef, renderable)}
					emptyText='No results found'
					onCommit={selectCurrentOption}
					onSearchChange={setQuery}
					onSelect={(_, option) => {
						selectOptionByValue(filteredOptions, option?.value, onSelect)
					}}
					options={selectOptions}
					placeholder={placeholder}
					searchFocused
					searchValue={query}
					selectEmphasized
					selectedIndex={selectedIndex}
					selectFocused={false}
					selectHeight={listHeight}
					showScrollIndicator
				/>
			</box>
		</StackViewFrame>
	)
}

function useFilteredOptions<T>(options: ViewSelectOption<T>[], query: string): ViewSelectOption<T>[] {
	return useMemo(() => {
		const needle = query.trim().toLowerCase()
		if (!needle) {
			return options
		}

		return options.filter(option => `${option.title} ${option.description ?? ''}`.toLowerCase().includes(needle))
	}, [options, query])
}

function useSelectOptions<T>(filteredOptions: ViewSelectOption<T>[]): SelectOption[] {
	return useMemo<SelectOption[]>(
		() =>
			filteredOptions.map(option => ({
				description: option.description ?? '',
				name: option.title,
				value: option.value
			})),
		[filteredOptions]
	)
}

function useBoundSelectedIndex(
	query: string,
	optionCount: number,
	selectedIndex: number,
	setSelectedIndex: Dispatch<SetStateAction<number>>
): void {
	useEffect(() => {
		setSelectedIndex(0)
	}, [query, setSelectedIndex])

	useEffect(() => {
		if (selectedIndex < optionCount) {
			return
		}

		setSelectedIndex(Math.max(0, optionCount - 1))
	}, [optionCount, selectedIndex, setSelectedIndex])
}

function useAutoFocusInput(inputRef: MutableRefObject<InputRenderable | null>): void {
	useEffect(() => {
		setTimeout(() => {
			if (!inputRef.current || inputRef.current.isDestroyed) {
				return
			}

			inputRef.current.focus()
		}, 1)
	}, [inputRef])
}

function useViewSelectKeyboard<T>({
	filteredOptions,
	onDeleteAll,
	onDeleteCurrent,
	onSelectCurrent,
	selectedIndex,
	setSelectedIndex
}: {
	filteredOptions: ViewSelectOption<T>[]
	onDeleteAll?: () => void
	onDeleteCurrent?: (option: ViewSelectOption<T>) => void
	onSelectCurrent: () => void
	selectedIndex: number
	setSelectedIndex: Dispatch<SetStateAction<number>>
}): void {
	useKeyboardHandler(key => {
		if (handleDeleteShortcut(key, filteredOptions, selectedIndex, onDeleteAll, onDeleteCurrent)) {
			return
		}

		if (key.defaultPrevented) {
			return
		}

		const direction = getNavigationDirection(key)
		if (direction !== 0) {
			moveSelectedIndex(direction, filteredOptions.length, setSelectedIndex)
			preventKeyboardEvent(key)
			return
		}

		if (key.name === 'return' || key.name === 'enter') {
			preventKeyboardEvent(key)
			onSelectCurrent()
		}
	})
}

function handleDeleteShortcut<T>(
	key: ViewSelectKeyboardEvent,
	filteredOptions: ViewSelectOption<T>[],
	selectedIndex: number,
	onDeleteAll: (() => void) | undefined,
	onDeleteCurrent: ((option: ViewSelectOption<T>) => void) | undefined
): boolean {
	if (isDeleteCurrentKey(key) && onDeleteCurrent) {
		preventKeyboardEvent(key)
		deleteCurrentOption(filteredOptions, selectedIndex, onDeleteCurrent)
		return true
	}

	if (isDeleteAllKey(key) && onDeleteAll) {
		preventKeyboardEvent(key)
		onDeleteAll()
		return true
	}

	return false
}

function deleteCurrentOption<T>(
	filteredOptions: ViewSelectOption<T>[],
	selectedIndex: number,
	onDeleteCurrent: (option: ViewSelectOption<T>) => void
): void {
	const option = filteredOptions[selectedIndex]
	if (!option) {
		return
	}

	onDeleteCurrent(option)
}

function selectViewOption<T>(
	filteredOptions: ViewSelectOption<T>[],
	selectedIndex: number,
	onSelect: (option: ViewSelectOption<T>) => void
): void {
	const option = filteredOptions[selectedIndex]
	if (!option) {
		return
	}

	onSelect(option)
}

function selectOptionByValue<T>(
	filteredOptions: ViewSelectOption<T>[],
	value: T | null | undefined,
	onSelect: (option: ViewSelectOption<T>) => void
): void {
	const selected = filteredOptions.find(option => option.value === value)
	if (!selected) {
		return
	}

	onSelect(selected)
}

function configureSearchInput(
	inputRef: MutableRefObject<InputRenderable | null>,
	renderable: InputRenderable | null
): void {
	inputRef.current = renderable
	configureShortcutFriendlyField(renderable)
}

function moveSelectedIndex(
	direction: -1 | 1,
	optionCount: number,
	setSelectedIndex: Dispatch<SetStateAction<number>>
): void {
	if (optionCount <= 0) {
		return
	}

	setSelectedIndex(value => wrapIndex(value, optionCount, direction))
}

function wrapIndex(index: number, optionCount: number, direction: -1 | 1): number {
	return (index + direction + optionCount) % optionCount
}
