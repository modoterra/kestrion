import type { InputRenderable, SelectOption, SelectRenderable, TextareaRenderable } from '@opentui/core'
import type { ReactNode } from 'react'

import { THEME } from '../../../lib/ui/constants'
import { configureShortcutFriendlyField } from '../../../lib/ui/helpers'

export function AppInput({
	configureInput,
	focused,
	onChange,
	onSubmit,
	placeholder,
	selectable = false,
	textColor,
	value,
	width = '100%'
}: {
	configureInput?: (renderable: InputRenderable | null) => void
	focused: boolean
	onChange: (value: string) => void
	onSubmit?: () => void
	placeholder: string
	selectable?: boolean
	textColor?: string
	value: string
	width?: number | `${number}%` | 'auto'
}): ReactNode {
	return (
		<input
			backgroundColor={focused ? THEME.panelRaised : 'transparent'}
			cursorColor={THEME.accent}
			focused={focused}
			focusedBackgroundColor={THEME.panelRaised}
			focusedTextColor={THEME.offWhite}
			onChange={onChange}
			onInput={onChange}
			onSubmit={onSubmit}
			placeholder={placeholder}
			placeholderColor={THEME.muted}
			ref={configureInput ?? configureShortcutFriendlyField}
			selectable={selectable}
			textColor={textColor ?? (focused ? THEME.offWhite : undefined)}
			value={value}
			width={width}
		/>
	)
}

export function AppSelect({
	configureSelect,
	emphasized = false,
	focused,
	height,
	onCommit,
	onSelect,
	options,
	selectedDescriptionColor = THEME.offWhite,
	selectedIndex,
	showScrollIndicator = options.length > 3
}: {
	configureSelect?: (renderable: SelectRenderable | null) => void
	emphasized?: boolean
	focused: boolean
	height: number
	onCommit?: () => void
	onSelect: (index: number, option: SelectOption | null) => void
	options: SelectOption[]
	selectedDescriptionColor?: string
	selectedIndex: number
	showScrollIndicator?: boolean
}): ReactNode {
	return (
		<select
			descriptionColor={THEME.muted}
			focused={focused}
			focusedBackgroundColor={THEME.canvas}
			focusedTextColor={THEME.offWhite}
			height={height}
			onChange={onSelect}
			onSelect={(index, option) => {
				onSelect(index, option)
				onCommit?.()
			}}
			options={options}
			ref={configureSelect ?? configureShortcutFriendlyField}
			selectedBackgroundColor={emphasized ? THEME.selectFocused : THEME.selectActive}
			selectedDescriptionColor={selectedDescriptionColor}
			selectedIndex={selectedIndex}
			selectedTextColor={THEME.offWhite}
			showScrollIndicator={showScrollIndicator}
			textColor={THEME.softText}
		/>
	)
}

export function AppTextarea({
	focused,
	height,
	initialValue,
	keyBindings,
	onContentChange,
	onSubmit,
	placeholder,
	selectable = true,
	textareaKey,
	textareaRef,
	width = '100%'
}: {
	focused: boolean
	height: number
	initialValue: string
	keyBindings: Array<{ action: 'submit'; name: string }>
	onContentChange: () => void
	onSubmit: () => void
	placeholder: string
	selectable?: boolean
	textareaKey?: string
	textareaRef?: (renderable: TextareaRenderable | null) => void
	width?: number | `${number}%` | 'auto'
}): ReactNode {
	return (
		<textarea
			backgroundColor='transparent'
			cursorColor={THEME.accent}
			focused={focused}
			focusedBackgroundColor='transparent'
			height={height}
			initialValue={initialValue}
			keyBindings={keyBindings}
			key={textareaKey}
			onContentChange={onContentChange}
			onSubmit={onSubmit}
			placeholder={placeholder}
			placeholderColor={THEME.muted}
			ref={textareaRef}
			selectable={selectable}
			width={width}
			wrapMode='word'
		/>
	)
}
