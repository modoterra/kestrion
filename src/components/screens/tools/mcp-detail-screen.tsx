import type { TextareaRenderable } from '@opentui/core'
import type { ReactNode } from 'react'
import { useRef, useState } from 'react'

import type { McpToolCallResult, McpToolRecord } from '../../../lib/mcp/types'
import { useViewStack } from '../../../lib/navigation/view-stack'
import { RHYTHM, THEME } from '../../../lib/ui/constants'
import { configureShortcutFriendlyField } from '../../../lib/ui/helpers'
import { useKeyboardHandler } from '../../../lib/ui/keyboard'
import { AppTextarea } from '../../ui/forms/controls'
import { StackViewFrame } from '../../ui/layout/stack-view-frame'

type McpToolDetailScreenProps = {
	onCall: (toolName: string, argumentsJson: string) => Promise<McpToolCallResult>
	tool: McpToolRecord
}

export function McpToolDetailScreen(props: McpToolDetailScreenProps): ReactNode {
	const viewStack = useViewStack()
	const state = useMcpToolDetailState(props.tool.name, props.onCall)
	useMcpToolDetailKeyboard(viewStack.pop, state.busy, state.invoke)

	return (
		<StackViewFrame
			breadcrumb={['main', 'tools', props.tool.title]}
			title='MCP tool'>
			<McpToolDetailBody
				error={state.error}
				onArgumentsChange={state.handleArgumentsChange}
				result={state.result}
				tool={props.tool}
				toolState={state}
			/>
		</StackViewFrame>
	)
}

function useMcpToolDetailState(
	toolName: string,
	onCall: (toolName: string, argumentsJson: string) => Promise<McpToolCallResult>
): {
	argumentsJson: string
	argumentsRef: { current: TextareaRenderable | null }
	busy: boolean
	error: string | null
	handleArgumentsChange: () => void
	invoke: () => Promise<void>
	result: string | null
} {
	const argumentsRef = useRef<TextareaRenderable | null>(null)
	const [argumentsJson, setArgumentsJson] = useState('{}')
	const [result, setResult] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [busy, setBusy] = useState(false)

	return {
		argumentsJson,
		argumentsRef,
		busy,
		error,
		handleArgumentsChange: () => {
			setArgumentsJson(argumentsRef.current?.plainText ?? '')
		},
		invoke: () => invokeRemoteTool(toolName, argumentsJson, onCall, setBusy, setError, setResult),
		result
	}
}

function useMcpToolDetailKeyboard(popView: () => void, busy: boolean, invoke: () => Promise<void>): void {
	useKeyboardHandler(key => {
		if (key.defaultPrevented) {
			return
		}

		if (key.name === 'escape') {
			preventKeyboardEvent(key)
			popView()
			return
		}

		if (key.ctrl && key.name === 's' && !busy) {
			void invoke()
			preventKeyboardEvent(key)
		}
	})
}

async function invokeRemoteTool(
	toolName: string,
	argumentsJson: string,
	onCall: (toolName: string, argumentsJson: string) => Promise<McpToolCallResult>,
	setBusy: (busy: boolean) => void,
	setError: (error: string | null) => void,
	setResult: (result: string) => void
): Promise<void> {
	setBusy(true)
	setError(null)

	try {
		const response = await onCall(toolName, argumentsJson)
		setResult(response.resultJson)
		if (response.isError) {
			setError('The MCP server reported an error result for this tool call.')
		}
	} catch (error) {
		setError(error instanceof Error ? error.message : 'MCP tool call failed.')
	} finally {
		setBusy(false)
	}
}

function McpToolDetailBody({
	error,
	onArgumentsChange,
	result,
	tool,
	toolState
}: {
	error: string | null
	onArgumentsChange: () => void
	result: string | null
	tool: McpToolRecord
	toolState: ReturnType<typeof useMcpToolDetailState>
}): ReactNode {
	return (
		<box
			flexDirection='column'
			flexGrow={1}
			minHeight={0}>
			<scrollbox
				contentOptions={{ flexDirection: 'column', paddingBottom: 1 }}
				horizontalScrollbarOptions={{ visible: false }}
				verticalScrollbarOptions={{ visible: false }}>
				<box
					flexDirection='column'
					gap={RHYTHM.section}>
					<McpToolHero tool={tool} />
					<McpToolHints tool={tool} />
					<McpToolParameters tool={tool} />
					<McpToolArguments
						argumentsJson={toolState.argumentsJson}
						argumentsRef={toolState.argumentsRef}
						busy={toolState.busy}
						onArgumentsChange={onArgumentsChange}
					/>
					{error ? (
						<text
							fg={THEME.danger}
							selectable={false}>
							{error}
						</text>
					) : null}
					<McpToolResult
						busy={toolState.busy}
						result={result}
					/>
				</box>
			</scrollbox>
		</box>
	)
}

function McpToolHero({ tool }: { tool: McpToolRecord }): ReactNode {
	return (
		<box
			flexDirection='column'
			gap={RHYTHM.stack}>
			<text
				fg={THEME.accent}
				selectable={false}>
				<strong>{tool.title}</strong>
			</text>
			<text
				fg={THEME.muted}
				selectable={false}>
				{tool.name}
			</text>
			<text
				fg={THEME.offWhite}
				selectable={false}>
				{tool.description}
			</text>
		</box>
	)
}

function McpToolHints({ tool }: { tool: McpToolRecord }): ReactNode {
	const hints = [
		tool.readOnlyHint ? 'read-only' : 'may write',
		tool.destructiveHint ? 'destructive' : 'non-destructive',
		tool.idempotentHint ? 'idempotent' : 'non-idempotent',
		tool.openWorldHint ? 'open-world' : 'closed-world'
	]

	return (
		<box
			flexDirection='column'
			gap={1}>
			<SectionTitle title='Hints' />
			<text
				fg={THEME.offWhite}
				selectable={false}>
				{hints.join(' · ')}
			</text>
		</box>
	)
}

function McpToolParameters({ tool }: { tool: McpToolRecord }): ReactNode {
	return (
		<box
			flexDirection='column'
			gap={RHYTHM.stack}>
			<SectionTitle title='Parameters' />
			{tool.parameters.length <= 0 ? (
				<text
					fg={THEME.muted}
					selectable={false}>
					This tool does not declare any input parameters.
				</text>
			) : (
				tool.parameters.map(parameter => (
					<box
						flexDirection='column'
						gap={1}
						key={parameter.name}>
						<text
							fg={THEME.accent}
							selectable={false}>
							{parameter.name}
						</text>
						<text
							fg={THEME.muted}
							selectable={false}>
							{formatParameterMeta(parameter.required, parameter.type)}
						</text>
						<text
							fg={THEME.offWhite}
							selectable={false}>
							{parameter.description}
						</text>
					</box>
				))
			)}
		</box>
	)
}

function McpToolArguments({
	argumentsJson,
	argumentsRef,
	busy,
	onArgumentsChange
}: {
	argumentsJson: string
	argumentsRef: { current: TextareaRenderable | null }
	busy: boolean
	onArgumentsChange: () => void
}): ReactNode {
	return (
		<box
			flexDirection='column'
			gap={1}>
			<SectionTitle title='Arguments' />
			<text
				fg={THEME.muted}
				selectable={false}>
				Edit the JSON payload, then press ctrl+s to invoke the tool.
			</text>
			<AppTextarea
				focused={!busy}
				height={8}
				initialValue={argumentsJson}
				keyBindings={[{ action: 'submit', name: 'ctrl+s' }]}
				onContentChange={onArgumentsChange}
				onSubmit={() => {}}
				placeholder='{}'
				textareaRef={renderable => {
					argumentsRef.current = renderable
					configureShortcutFriendlyField(renderable)
				}}
			/>
		</box>
	)
}

function McpToolResult({ busy, result }: { busy: boolean; result: string | null }): ReactNode {
	return (
		<box
			flexDirection='column'
			gap={1}>
			<SectionTitle title='Result' />
			<text
				fg={busy ? THEME.accent : THEME.muted}
				selectable={false}>
				{busy ? 'Calling MCP tool…' : result ? 'Latest response' : 'No tool call yet.'}
			</text>
			{result ? (
				<text
					fg={THEME.offWhite}
					selectable>
					{result}
				</text>
			) : null}
		</box>
	)
}

function SectionTitle({ title }: { title: string }): ReactNode {
	return (
		<text
			fg={THEME.summaryAccent}
			selectable={false}>
			<strong>{title}</strong>
		</text>
	)
}

function formatParameterMeta(required: boolean, type: string): string {
	return `${required ? 'required' : 'optional'} · ${type}`
}

function preventKeyboardEvent(key: { preventDefault: () => void; stopPropagation: () => void }): void {
	key.preventDefault()
	key.stopPropagation()
}
