import type { ReactNode } from 'react'

import { useViewStack } from '../../../lib/navigation/view-stack'
import { useKeyboardHandler } from '../../../lib/ui/keyboard'
import { ViewSelect, type ViewSelectOption } from '../../ui/navigation/view-select'

export type CommandPaletteOption = ViewSelectOption<string> & { run: () => void | Promise<void> }

export function CommandPaletteScreen({
	onSelectCommand,
	options
}: {
	onSelectCommand: (option: CommandPaletteOption | undefined) => void
	options: CommandPaletteOption[]
}): ReactNode {
	const viewStack = useViewStack()

	useKeyboardHandler(key => {
		if (key.defaultPrevented || !key.ctrl || key.name !== 'k') {
			return
		}

		viewStack.pop()
		key.preventDefault()
		key.stopPropagation()
	})

	return (
		<ViewSelect
			onSelect={option => {
				const selected = options.find(item => item.value === option.value)
				onSelectCommand(selected)
				viewStack.pop()
			}}
			options={options}
			placeholder='Search commands'
			title='Commands'
		/>
	)
}
