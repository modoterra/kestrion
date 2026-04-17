import type { ReactNode } from 'react'

import { useViewStack } from '../../../lib/navigation/view-stack'
import type { ProviderDraft } from '../../../lib/provider-config/fields'
import type { ProviderModelRecord } from '../../../lib/types'
import { RHYTHM, THEME } from '../../../lib/ui/constants'
import { StackViewFrame } from '../../ui/layout/stack-view-frame'
import { Shortcut, StepStrip, SummaryLine } from '../../ui/provider-config/sections'
import { ProviderConfigStepContent } from '../../ui/provider-config/step-content'
import { useProviderConfigKeyboard } from './use-keyboard'
import { useProviderConfigState } from './use-state'

type ProviderConfigViewProps = {
	fireworksModels: ProviderModelRecord[]
	initialDraft: ProviderDraft
	onReset: () => void
	onSave: (draft: ProviderDraft) => Promise<string | null>
}

export function ProviderConfigScreen(props: ProviderConfigViewProps): ReactNode {
	const viewStack = useViewStack()
	const state = useProviderConfigState(props.fireworksModels, props.initialDraft)

	useProviderConfigKeyboard({
		activeProviderId: state.activeProviderId,
		advanceWizardGroup: state.advanceWizardGroup,
		currentField: state.currentField,
		draft: state.draft,
		filteredProviderOptions: state.filteredProviderOptions,
		focusFieldCount: state.focusFields.length,
		modelOptions: state.modelOptions,
		onReset: props.onReset,
		onSave: props.onSave,
		popView: viewStack.pop,
		resetToInitial: state.resetToInitial,
		selectedModelIndex: state.selectedModelIndex,
		selectModel: state.updateSelectedModel,
		selectProvider: state.updateProvider,
		setError: state.setError,
		setFocusIndex: state.setFocusIndex,
		setStepIndex: state.setStepIndex,
		stepCount: state.steps.length
	})

	return (
		<StackViewFrame
			breadcrumb={['settings', 'provider']}
			title='Provider setup'>
			<ProviderConfigLayout
				fireworksModels={props.fireworksModels}
				state={state}
			/>
		</StackViewFrame>
	)
}

function ProviderConfigLayout({
	fireworksModels,
	state
}: {
	fireworksModels: ProviderModelRecord[]
	state: ReturnType<typeof useProviderConfigState>
}): ReactNode {
	return (
		<box
			flexDirection='column'
			flexGrow={1}
			gap={RHYTHM.stack}
			minHeight={0}>
			<ProviderConfigHeader
				activeProviderId={state.activeProviderId}
				currentStep={state.currentStep}
				draft={state.draft}
				error={state.error}
				fireworksModels={fireworksModels}
				steps={state.steps}
			/>
			<ProviderConfigBody
				fireworksModels={fireworksModels}
				state={state}
			/>
		</box>
	)
}

function ProviderConfigHeader({
	activeProviderId,
	currentStep,
	draft,
	error,
	fireworksModels,
	steps
}: {
	activeProviderId: ReturnType<typeof useProviderConfigState>['activeProviderId']
	currentStep: ReturnType<typeof useProviderConfigState>['currentStep']
	draft: ProviderDraft
	error: string | null
	fireworksModels: ProviderModelRecord[]
	steps: ReturnType<typeof useProviderConfigState>['steps']
}): ReactNode {
	return (
		<>
			<ProviderConfigShortcuts />
			{error ? (
				<text
					fg={THEME.danger}
					selectable={false}>
					{error}
				</text>
			) : null}
			<SummaryLine
				activeProviderId={activeProviderId}
				draft={draft}
				fireworksModels={fireworksModels}
			/>
			<StepStrip
				currentStep={currentStep}
				steps={steps}
			/>
		</>
	)
}

function ProviderConfigBody({
	fireworksModels,
	state
}: {
	fireworksModels: ProviderModelRecord[]
	state: ReturnType<typeof useProviderConfigState>
}): ReactNode {
	return (
		<scrollbox
			contentOptions={{ flexDirection: 'column', paddingBottom: 1 }}
			maxHeight={state.formHeight}
			horizontalScrollbarOptions={{ visible: false }}
			verticalScrollbarOptions={{ visible: false }}>
			<box
				flexDirection='column'
				gap={1}>
				<ProviderConfigStepContent
					activeProviderId={state.activeProviderId}
					compactAutoPromptCharsIndex={state.compactAutoPromptCharsIndex}
					compactAutoPromptCharsOptions={state.compactAutoPromptCharsOptions}
					compactAutoTurnThresholdIndex={state.compactAutoTurnThresholdIndex}
					compactAutoTurnThresholdOptions={state.compactAutoTurnThresholdOptions}
					compactTailTurnsIndex={state.compactTailTurnsIndex}
					compactTailTurnsOptions={state.compactTailTurnsOptions}
					currentField={state.currentField}
					currentStep={state.currentStep}
					draft={state.draft}
					fireworksModels={fireworksModels}
					maxTokenIndex={state.maxTokenIndex}
					maxTokenOptions={state.maxTokenOptions}
					modelOptions={state.modelOptions}
					modelQuery={state.modelQuery}
					onAdvance={state.advanceWizardGroup}
					onModelSearchChange={state.updateModelQuery}
					onProviderSearchChange={state.updateProviderQuery}
					onSelectCompactAutoPromptChars={value => state.updateDraftField('compactAutoPromptChars', value)}
					onSelectCompactAutoTurnThreshold={value => state.updateDraftField('compactAutoTurnThreshold', value)}
					onSelectCompactTailTurns={value => state.updateDraftField('compactTailTurns', value)}
					onSelectMaxTokens={value => state.updateDraftField('maxTokens', value)}
					onSelectModel={state.updateSelectedModel}
					onSelectPromptTruncateLength={value => state.updateDraftField('promptTruncateLength', value)}
					onSelectProvider={state.updateProvider}
					onSelectTemperature={value => state.updateDraftField('temperature', value)}
					onUpdateDraftField={state.updateDraftField}
					providerOptions={state.filteredProviderOptions}
					providerQuery={state.providerQuery}
					promptTruncateIndex={state.promptTruncateIndex}
					promptTruncateOptions={state.promptTruncateOptions}
					selectedModelIndex={state.selectedModelIndex}
					selectedProviderIndex={state.activeProviderIndex}
					temperatureIndex={state.temperatureIndex}
					temperatureOptions={state.temperatureOptions}
				/>
			</box>
		</scrollbox>
	)
}

function ProviderConfigShortcuts(): ReactNode {
	return (
		<box
			flexDirection='row'
			gap={2}>
			<Shortcut
				command='ctrl+s'
				label='save'
			/>
			<Shortcut
				command='←→'
				label='steps'
			/>
			<Shortcut
				command='ctrl+r'
				label='reset'
			/>
		</box>
	)
}
