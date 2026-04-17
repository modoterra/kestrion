import type { ReactNode } from 'react'

import type { AppService } from '../../../lib/services/app-service'
import type { McpToolListing } from '../../../lib/mcp/types'
import { useViewStack } from '../../../lib/navigation/view-stack'
import { buildToolCatalog } from '../../../lib/tools'
import { PHASE1_WORKER_TOOL_REGISTRY } from '../../../lib/tools/worker-tool-registry'
import { ViewSelect, type ViewSelectOption } from '../../ui/navigation/view-select'
import { McpToolDetailScreen } from './mcp-detail-screen'
import { ToolDetailScreen } from './detail-screen'

type ToolOptionValue = { kind: 'builtin'; name: string } | { kind: 'mcp'; name: string } | { kind: 'status' }

export function ToolsScreen({
	mcpError,
	mcpListing,
	service
}: {
	mcpError: string | null
	mcpListing: McpToolListing | null
	service: AppService
}): ReactNode {
	const viewStack = useViewStack()
	const catalog = buildToolCatalog(PHASE1_WORKER_TOOL_REGISTRY)
	const options = buildToolOptions(catalog, mcpListing, mcpError)
	const onCall = service.callMcpTool.bind(service)

	return (
		<ViewSelect
			onSelect={option => handleToolSelection(option.value, catalog, mcpListing, onCall, viewStack)}
			options={options}
			placeholder='Search tools'
			title='Tools'
		/>
	)
}

function handleToolSelection(
	selectedValue: ToolOptionValue,
	catalog: ReturnType<typeof buildToolCatalog>,
	mcpListing: McpToolListing | null,
	onCall: AppService['callMcpTool'],
	viewStack: ReturnType<typeof useViewStack>
): void {
	if (selectedValue.kind === 'status') {
		return
	}

	if (selectedValue.kind === 'builtin') {
		const tool = catalog.find(entry => entry.name === selectedValue.name)
		if (!tool) {
			return
		}

		viewStack.push({ element: <ToolDetailScreen tool={tool} /> })
		return
	}

	const tool = mcpListing?.tools.find(entry => entry.name === selectedValue.name)
	if (!tool) {
		return
	}

	viewStack.push({
		element: <McpToolDetailScreen onCall={onCall} tool={tool} />
	})
}

function buildToolListDescription(category: string, execution: string, scope: string): string {
	return `${category} · ${execution} · ${scope}`
}

function buildToolOptions(
	catalog: ReturnType<typeof buildToolCatalog>,
	mcpListing: McpToolListing | null,
	mcpError: string | null
): Array<ViewSelectOption<ToolOptionValue>> {
	const builtInOptions = catalog.map<ViewSelectOption<ToolOptionValue>>(tool => ({
		description: `built-in · ${buildToolListDescription(tool.category, tool.execution, tool.scope)}`,
		title: tool.name,
		value: { kind: 'builtin', name: tool.name }
	}))

	const mcpOptions = (mcpListing?.tools ?? []).map<ViewSelectOption<ToolOptionValue>>(tool => ({
		description: buildMcpToolDescription(tool),
		title: tool.title,
		value: { kind: 'mcp', name: tool.name }
	}))

	if (mcpOptions.length > 0) {
		return [...mcpOptions, ...builtInOptions]
	}

	if (mcpError) {
		return [
			{
				description: mcpError,
				title: 'MCP unavailable',
				value: { kind: 'status' }
			},
			...builtInOptions
		]
	}

	return builtInOptions
}

function buildMcpToolDescription(tool: McpToolListing['tools'][number]): string {
	const behavior = [
		tool.readOnlyHint ? 'read-only' : 'may write',
		tool.openWorldHint ? 'open-world' : 'closed-world'
	]

	return `mcp · ${behavior.join(' · ')}`
}
