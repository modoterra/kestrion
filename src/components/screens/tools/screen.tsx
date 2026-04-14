import type { ReactNode } from 'react'

import { useViewStack } from '../../../lib/navigation/view-stack'
import { getToolCatalogEntry, TOOL_CATALOG } from '../../../lib/tools'
import { ViewSelect, type ViewSelectOption } from '../../ui/navigation/view-select'
import { ToolDetailScreen } from './detail-screen'

export function ToolsScreen(): ReactNode {
	const viewStack = useViewStack()
	const options = TOOL_CATALOG.map<ViewSelectOption<string>>(tool => ({
		description: buildToolListDescription(tool.category, tool.execution, tool.scope),
		title: tool.name,
		value: tool.name
	}))

	return (
		<ViewSelect
			onSelect={option => {
				const tool = getToolCatalogEntry(String(option.value))
				if (!tool) {
					return
				}

				viewStack.push({ element: <ToolDetailScreen tool={tool} /> })
			}}
			options={options}
			placeholder='Search tools'
			title='Tools'
		/>
	)
}

function buildToolListDescription(category: string, execution: string, scope: string): string {
	return `${category} · ${execution} · ${scope}`
}
