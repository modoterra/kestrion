import type { SelectOption } from '@opentui/core'
import type { ReactNode } from 'react'

import type { ProviderDraft, ProviderTabId } from '../../../lib/provider-config/fields'
import type { FocusField, StepId } from '../../../lib/provider-config/types'
import type { ProviderModelRecord } from '../../../lib/types'
import { LimitsSections } from './limit-sections'
import { FieldLabel, SectionExplanation, SectionTitle, SelectionSection, SoftInput } from './sections'

export type ProviderConfigStepContentProps = {
	activeProviderId: ProviderTabId
	currentField: FocusField
	currentStep: StepId
	draft: ProviderDraft
	fireworksModels: ProviderModelRecord[]
	maxTokenIndex: number
	maxTokenOptions: SelectOption[]
	modelOptions: SelectOption[]
	modelQuery: string
	onAdvance: () => void
	onModelSearchChange: (value: string) => void
	onProviderSearchChange: (value: string) => void
	onSelectMaxTokens: (value: string) => void
	onSelectModel: (value: string) => void
	onSelectPromptTruncateLength: (value: string) => void
	onSelectProvider: (providerId: ProviderTabId) => void
	onSelectTemperature: (value: string) => void
	onUpdateDraftField: (field: 'apiKey' | 'apiKeyEnv' | 'baseUrl', value: string) => void
	providerOptions: SelectOption[]
	providerQuery: string
	promptTruncateIndex: number
	promptTruncateOptions: SelectOption[]
	selectedModelIndex: number
	selectedProviderIndex: number
	temperatureIndex: number
	temperatureOptions: SelectOption[]
}

export function ProviderConfigStepContent(props: ProviderConfigStepContentProps): ReactNode {
	if (props.currentStep === 'provider') {
		return <ProviderSelectionStep {...props} />
	}

	if (props.currentStep === 'model') {
		return <ModelSelectionStep {...props} />
	}

	if (props.currentStep === 'limits') {
		return <LimitsSections {...props} />
	}

	return props.currentStep === 'credentials' ? <CredentialsSection {...props} /> : <AdvancedSection {...props} />
}

function ProviderSelectionStep({
	currentField,
	onAdvance,
	onProviderSearchChange,
	onSelectProvider,
	providerOptions,
	providerQuery,
	selectedProviderIndex
}: Pick<
	ProviderConfigStepContentProps,
	| 'currentField'
	| 'onAdvance'
	| 'onProviderSearchChange'
	| 'onSelectProvider'
	| 'providerOptions'
	| 'providerQuery'
	| 'selectedProviderIndex'
>): ReactNode {
	return (
		<SelectionSection
			currentField={currentField}
			onAdvance={onAdvance}
			onSearchChange={onProviderSearchChange}
			onSelect={(_, option) => {
				if (typeof option?.value === 'string') {
					onSelectProvider(option.value as ProviderTabId)
				}
			}}
			options={providerOptions}
			searchField='providerSearch'
			searchPlaceholder='Search providers'
			searchValue={providerQuery}
			selectField='providerSelect'
			selectedIndex={selectedProviderIndex}
			selectHeight={6}
			title='Provider'
		/>
	)
}

function ModelSelectionStep({
	currentField,
	modelOptions,
	modelQuery,
	onAdvance,
	onModelSearchChange,
	onSelectModel,
	selectedModelIndex
}: Pick<
	ProviderConfigStepContentProps,
	| 'currentField'
	| 'modelOptions'
	| 'modelQuery'
	| 'onAdvance'
	| 'onModelSearchChange'
	| 'onSelectModel'
	| 'selectedModelIndex'
>): ReactNode {
	return (
		<SelectionSection
			currentField={currentField}
			onAdvance={onAdvance}
			onSearchChange={onModelSearchChange}
			onSelect={(_, option) => {
				if (typeof option?.value === 'string') {
					onSelectModel(option.value)
				}
			}}
			options={modelOptions}
			searchField='modelSearch'
			searchPlaceholder='Search models'
			searchValue={modelQuery}
			selectField='modelSelect'
			selectedIndex={selectedModelIndex}
			selectHeight={6}
			title='Model'
		/>
	)
}

function CredentialsSection({
	currentField,
	draft,
	onUpdateDraftField
}: Pick<ProviderConfigStepContentProps, 'currentField' | 'draft' | 'onUpdateDraftField'>): ReactNode {
	return (
		<>
			<SectionTitle label='Credentials' />
			<SectionExplanation text='Save an API key locally or rely on an environment variable at runtime.' />
			<FieldLabel
				active={currentField === 'apiKey'}
				label='Saved API Key'
			/>
			<SoftInput
				active={currentField === 'apiKey'}
				onChange={value => onUpdateDraftField('apiKey', value)}
				placeholder='Optional, saved into config.json'
				value={draft.apiKey}
			/>
			<FieldLabel
				active={currentField === 'apiKeyEnv'}
				label='API Key Env'
			/>
			<SoftInput
				active={currentField === 'apiKeyEnv'}
				onChange={value => onUpdateDraftField('apiKeyEnv', value)}
				placeholder='FIREWORKS_API_KEY'
				value={draft.apiKeyEnv}
			/>
		</>
	)
}

function AdvancedSection({
	currentField,
	draft,
	onUpdateDraftField
}: Pick<ProviderConfigStepContentProps, 'currentField' | 'draft' | 'onUpdateDraftField'>): ReactNode {
	return (
		<>
			<SectionTitle label='Base URL' />
			<SectionExplanation text='Custom providers can point at any OpenAI-compatible endpoint.' />
			<FieldLabel
				active={currentField === 'baseUrl'}
				label='Base URL'
			/>
			<SoftInput
				active={currentField === 'baseUrl'}
				onChange={value => onUpdateDraftField('baseUrl', value)}
				placeholder='https://api.example.com/v1'
				value={draft.baseUrl}
			/>
		</>
	)
}
