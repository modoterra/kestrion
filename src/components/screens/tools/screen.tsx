import type { ReactNode } from 'react'

import { useViewStack } from '../../../lib/navigation/view-stack'
import { buildToolCatalog } from '../../../lib/tools'
import { PHASE1_WORKER_TOOL_REGISTRY } from '../../../lib/tools/worker-tool-registry'
import { ViewSelect, type ViewSelectOption } from '../../ui/navigation/view-select'
import { ToolDetailScreen } from './detail-screen'

export function ToolsScreen(): ReactNode {
	const viewStack = useViewStack()
	const catalog = buildToolCatalog(PHASE1_WORKER_TOOL_REGISTRY)
	const options = catalog.map<ViewSelectOption<string>>(tool => ({
		description: buildToolListDescription(tool.category, tool.execution, tool.scope),
		title: tool.name,
		value: tool.name
	}))

	return (
		<ViewSelect
			onSelect={option => {
				const tool = catalog.find(entry => entry.name === String(option.value))
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
