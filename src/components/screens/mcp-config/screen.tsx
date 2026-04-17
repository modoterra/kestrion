import type { SelectOption } from '@opentui/core'
import type { ReactNode } from 'react'
import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'

import type { McpDraft } from '../../../lib/mcp/draft-utils'
import { useViewStack } from '../../../lib/navigation/view-stack'
import { RHYTHM, THEME } from '../../../lib/ui/constants'
import { useKeyboardHandler } from '../../../lib/ui/keyboard'
import { AppInput, AppSelect } from '../../ui/forms/controls'
import { StackViewFrame } from '../../ui/layout/stack-view-frame'
import { FieldLabel, SectionExplanation, SectionTitle, Shortcut } from '../../ui/provider-config/sections'

type McpFocusField = 'enabled' | 'endpoint' | 'pat' | 'patEnv'

type McpConfigScreenProps = {
	initialDraft: McpDraft
	onReset: () => void
	onSave: (draft: McpDraft) => Promise<string | null>
}

const ENABLED_OPTIONS: SelectOption[] = [
	{ description: 'Connect to the configured MCP endpoint', name: 'Enabled', value: 'enabled' },
	{ description: 'Hide remote MCP tools and skip MCP requests', name: 'Disabled', value: 'disabled' }
]
const FOCUS_FIELDS: McpFocusField[] = ['enabled', 'endpoint', 'pat', 'patEnv']

export function McpConfigScreen(props: McpConfigScreenProps): ReactNode {
	const viewStack = useViewStack()
	const state = useMcpConfigState(props.initialDraft)

	useMcpConfigKeyboard({
		currentField: state.currentField,
		draft: state.draft,
		onReset: props.onReset,
		onSave: props.onSave,
		popView: viewStack.pop,
		resetToInitial: state.resetToInitial,
		setError: state.setError,
		setFocusIndex: state.setFocusIndex,
		updateDraft: state.updateDraft
	})

	return (
		<StackViewFrame
			breadcrumb={['settings', 'mcp']}
			title='MCP setup'>
			<box
				flexDirection='column'
				flexGrow={1}
				gap={RHYTHM.stack}
				minHeight={0}>
				<McpConfigShortcuts />
				<McpConfigSummary draft={state.draft} />
				{state.error ? (
					<text
						fg={THEME.danger}
						selectable={false}>
						{state.error}
					</text>
				) : null}
				<scrollbox
					contentOptions={{ flexDirection: 'column', paddingBottom: 1 }}
					horizontalScrollbarOptions={{ visible: false }}
					verticalScrollbarOptions={{ visible: false }}>
					<box
						flexDirection='column'
						gap={RHYTHM.section}>
						<McpEnabledSection
							currentField={state.currentField}
							draft={state.draft}
							updateDraft={state.updateDraft}
						/>
						<McpInputSection
							active={state.currentField === 'endpoint'}
							description='Enter the full Streamable HTTP MCP endpoint, including the /mcp path.'
							label='Endpoint'
							onChange={value => state.updateDraft('endpoint', value)}
							placeholder='https://example.com/mcp'
							value={state.draft.endpoint}
						/>
						<McpInputSection
							active={state.currentField === 'pat'}
							description='Store a PAT locally, or leave this blank and use the env var below.'
							label='Saved PAT'
							onChange={value => state.updateDraft('pat', value)}
							placeholder='Optional, saved into config.json'
							value={state.draft.pat}
						/>
						<McpInputSection
							active={state.currentField === 'patEnv'}
							description='This env var is checked before the saved PAT on every MCP request.'
							label='PAT Env'
							onChange={value => state.updateDraft('patEnv', value)}
							placeholder='KESTRION_MCP_PAT'
							value={state.draft.patEnv}
						/>
					</box>
				</scrollbox>
			</box>
		</StackViewFrame>
	)
}

function useMcpConfigState(initialDraft: McpDraft): {
	currentField: McpFocusField
	draft: McpDraft
	error: string | null
	resetToInitial: () => void
	setError: Dispatch<SetStateAction<string | null>>
	setFocusIndex: Dispatch<SetStateAction<number>>
	updateDraft: (field: keyof McpDraft, value: string | boolean) => void
} {
	const [draft, setDraft] = useState(initialDraft)
	const [error, setError] = useState<string | null>(null)
	const [focusIndex, setFocusIndex] = useState(0)
	const currentField = FOCUS_FIELDS[Math.min(focusIndex, FOCUS_FIELDS.length - 1)] ?? 'enabled'

	return {
		currentField,
		draft,
		error,
		resetToInitial: () => {
			setDraft(initialDraft)
			setError(null)
			setFocusIndex(0)
		},
		setError,
		setFocusIndex,
		updateDraft: (field, value) => {
			setDraft(current => ({ ...current, [field]: value }))
			if (error) {
				setError(null)
			}
		}
	}
}

function useMcpConfigKeyboard(args: {
	currentField: McpFocusField
	draft: McpDraft
	onReset: () => void
	onSave: (draft: McpDraft) => Promise<string | null>
	popView: () => void
	resetToInitial: () => void
	setError: (error: string | null) => void
	setFocusIndex: Dispatch<SetStateAction<number>>
	updateDraft: (field: keyof McpDraft, value: string | boolean) => void
}): void {
	useKeyboardHandler(key => {
		if (key.defaultPrevented) {
			return
		}

		if (key.name === 'escape') {
			preventKeyboardEvent(key)
			args.popView()
			return
		}

		if (key.name === 'tab') {
			args.setFocusIndex(value => (value + (key.shift ? -1 : 1) + FOCUS_FIELDS.length) % FOCUS_FIELDS.length)
			preventKeyboardEvent(key)
			return
		}

		if (!key.ctrl) {
			return
		}

		if (key.name === 'r') {
			args.resetToInitial()
			args.onReset()
			preventKeyboardEvent(key)
			return
		}

		if (key.name === 's') {
			void args.onSave(args.draft).then(nextError => {
				if (nextError) {
					args.setError(nextError)
					return
				}

				args.popView()
			})
			preventKeyboardEvent(key)
			return
		}

		if (key.name === 'space' && args.currentField === 'enabled') {
			args.updateDraft('enabled', !args.draft.enabled)
			preventKeyboardEvent(key)
		}
	})
}

function McpConfigShortcuts(): ReactNode {
	return (
		<box
			flexDirection='row'
			gap={2}>
			<Shortcut
				command='ctrl+s'
				label='save'
			/>
			<Shortcut
				command='tab'
				label='fields'
			/>
			<Shortcut
				command='ctrl+r'
				label='reset'
			/>
		</box>
	)
}

function McpConfigSummary({ draft }: { draft: McpDraft }): ReactNode {
	const state = draft.enabled ? 'enabled' : 'disabled'
	const endpointSummary = draft.endpoint.trim() || '(unset)'

	return (
		<box
			flexDirection='row'
			flexWrap='wrap'
			gap={1}>
			<McpSummarySegment
				label='state'
				value={state}
			/>
			<McpSummarySegment
				label='endpoint'
				value={endpointSummary}
			/>
		</box>
	)
}

function McpSummarySegment({ label, value }: { label: string; value: string }): ReactNode {
	return (
		<box
			flexDirection='row'
			gap={1}>
			<text
				fg={THEME.summaryAccent}
				selectable={false}
				wrapMode='none'>
				{label}
			</text>
			<text
				fg={THEME.offWhite}
				selectable={false}>
				{value}
			</text>
		</box>
	)
}

function McpEnabledSection({
	currentField,
	draft,
	updateDraft
}: {
	currentField: McpFocusField
	draft: McpDraft
	updateDraft: (field: keyof McpDraft, value: string | boolean) => void
}): ReactNode {
	const selectedIndex = useMemo(() => (draft.enabled ? 0 : 1), [draft.enabled])

	return (
		<box
			flexDirection='column'
			gap={1}>
			<SectionTitle
				active={currentField === 'enabled'}
				label='Connection'
			/>
			<SectionExplanation
				active={currentField === 'enabled'}
				text='Enable or disable the remote MCP connection without clearing the saved endpoint or PAT.'
			/>
			<FieldLabel
				active={currentField === 'enabled'}
				label='State'
			/>
			<AppSelect
				emphasized={currentField === 'enabled'}
				focused={currentField === 'enabled'}
				height={3}
				onSelect={(_, option) => {
					updateDraft('enabled', option?.value === 'enabled')
				}}
				options={ENABLED_OPTIONS}
				selectedIndex={selectedIndex}
			/>
		</box>
	)
}

function McpInputSection({
	active,
	description,
	label,
	onChange,
	placeholder,
	value
}: {
	active: boolean
	description: string
	label: string
	onChange: (value: string) => void
	placeholder: string
	value: string
}): ReactNode {
	return (
		<box
			flexDirection='column'
			gap={1}>
			<SectionTitle
				active={active}
				label={label}
			/>
			<SectionExplanation
				active={active}
				text={description}
			/>
			<FieldLabel
				active={active}
				label={label}
			/>
			<AppInput
				focused={active}
				onChange={onChange}
				placeholder={placeholder}
				value={value}
			/>
		</box>
	)
}

function preventKeyboardEvent(key: { preventDefault: () => void; stopPropagation: () => void }): void {
	key.preventDefault()
	key.stopPropagation()
}
