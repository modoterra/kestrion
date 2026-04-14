import type { InputRenderable, SelectOption } from '@opentui/core'
import type { ReactNode } from 'react'

import { THEME } from '../../../lib/ui/constants'
import { AppInput, AppSelect } from './controls'

type SearchSelectInputProps = {
	configureInput?: (renderable: InputRenderable | null) => void
	emptyText?: string
	onCommit?: () => void
	onSearchChange: (value: string) => void
	onSelect: (index: number, option: SelectOption | null) => void
	options: SelectOption[]
	placeholder: string
	searchFocused: boolean
	searchValue: string
	selectFocused: boolean
	selectedDescriptionColor?: string
	selectEmphasized?: boolean
	selectedIndex: number
	selectHeight: number
	showScrollIndicator?: boolean
	title?: string
	titleActive?: boolean
	width?: number | `${number}%` | 'auto'
}

export function SearchSelectInput(props: SearchSelectInputProps): ReactNode {
	return (
		<box
			flexDirection='column'
			gap={1}>
			<SearchSelectTitle
				title={props.title}
				titleActive={props.titleActive ?? false}
			/>
			<SearchSelectBody
				{...props}
				showSelect={props.options.length > 0 || !props.emptyText}
			/>
		</box>
	)
}

function SearchSelectBody({
	configureInput,
	emptyText,
	onCommit,
	onSearchChange,
	onSelect,
	options,
	placeholder,
	searchFocused,
	searchValue,
	selectEmphasized,
	selectFocused,
	selectedDescriptionColor,
	selectedIndex,
	selectHeight,
	showScrollIndicator,
	showSelect,
	width
}: SearchSelectInputProps & { showSelect: boolean }): ReactNode {
	return (
		<>
			<AppInput
				configureInput={configureInput}
				focused={searchFocused}
				onChange={onSearchChange}
				placeholder={placeholder}
				value={searchValue}
				width={width}
			/>
			{showSelect ? (
				<AppSelect
					emphasized={selectEmphasized}
					focused={selectFocused}
					height={selectHeight}
					onCommit={onCommit}
					onSelect={onSelect}
					options={options}
					selectedDescriptionColor={selectedDescriptionColor}
					selectedIndex={selectedIndex}
					showScrollIndicator={showScrollIndicator}
				/>
			) : (
				<SearchSelectEmptyState text={emptyText} />
			)}
		</>
	)
}

function SearchSelectTitle({ title, titleActive }: { title?: string; titleActive: boolean }): ReactNode {
	if (!title) {
		return null
	}

	return (
		<text
			fg={titleActive ? THEME.focusAccent : THEME.offWhite}
			selectable={false}>
			<strong>{title}</strong>
		</text>
	)
}

function SearchSelectEmptyState({ text }: { text?: string }): ReactNode {
	return (
		<text
			fg={THEME.muted}
			selectable={false}>
			{text}
		</text>
	)
}
