import type { SelectOption, TextareaRenderable } from '@opentui/core'
import type { ReactNode } from 'react'
import { useRef } from 'react'

import type { MatrixDraft } from '../../../lib/matrix-config/fields'
import type { MatrixFocusField, MatrixSelectField, MatrixStepId } from '../../../lib/matrix-config/types'
import { getMatrixFieldOptions, getMatrixStepLabel, toSelectOptions } from '../../../lib/matrix-config/utils'
import { useViewStack } from '../../../lib/navigation/view-stack'
import { RHYTHM, THEME } from '../../../lib/ui/constants'
import { shortenHomePath, configureShortcutFriendlyField } from '../../../lib/ui/helpers'
import { AppSelect, AppTextarea } from '../../ui/forms/controls'
import { StackViewFrame } from '../../ui/layout/stack-view-frame'
import { FieldLabel, SectionExplanation, SectionTitle, Shortcut } from '../../ui/provider-config/sections'
import { useMatrixConfigKeyboard } from './use-keyboard'
import { useMatrixConfigState } from './use-state'

type MatrixConfigScreenProps = {
	fileExists: boolean
	matrixPromptPath: string
	onReset: () => void
	onSave: (draft: MatrixDraft) => Promise<string | null>
}

export function MatrixConfigScreen(props: MatrixConfigScreenProps): ReactNode {
	const viewStack = useViewStack()
	const state = useMatrixConfigState(props.matrixPromptPath, props.fileExists)
	const customInstructionsRef = useRef<TextareaRenderable | null>(null)

	useMatrixConfigKeyboard({
		advanceWizardGroup: state.advanceWizardGroup,
		currentField: state.currentField,
		currentStep: state.currentStep,
		draft: state.draft,
		focusFieldCount: state.focusFields.length,
		onReset: props.onReset,
		onSave: props.onSave,
		popView: viewStack.pop,
		resetToInitial: state.resetToInitial,
		setError: state.setError,
		setFocusIndex: state.setFocusIndex,
		setStepIndex: state.setStepIndex,
		updateSelectField: state.updateSelectField
	})

	return (
		<StackViewFrame
			breadcrumb={['settings', 'matrix']}
			title='MATRIX setup'>
			<box
				flexDirection='column'
				flexGrow={1}
				gap={RHYTHM.stack}
				minHeight={0}>
				<MatrixConfigHeader
					currentStep={state.currentStep}
					error={state.error}
					fileExists={state.fileExists}
					matrixPromptPath={state.matrixPromptPath}
					steps={state.steps}
				/>
				<scrollbox
					contentOptions={{ flexDirection: 'column', paddingBottom: 1 }}
					horizontalScrollbarOptions={{ visible: false }}
					maxHeight={state.formHeight}
					verticalScrollbarOptions={{ visible: false }}>
					<MatrixConfigStepContent
						currentField={state.currentField}
						currentStep={state.currentStep}
						customInstructionsEpoch={state.customInstructionsEpoch}
						customInstructionsRef={customInstructionsRef}
						draft={state.draft}
						fileExists={state.fileExists}
						matrixPromptPath={state.matrixPromptPath}
						onAdvance={state.advanceWizardGroup}
						onCustomInstructionsChange={() => {
							state.updateDraftField('customInstructions', customInstructionsRef.current?.plainText ?? '')
						}}
						onSelectField={state.updateSelectField}
						previewContent={state.previewContent}
						selectedIndexes={state.selectedIndexes}
					/>
				</scrollbox>
			</box>
		</StackViewFrame>
	)
}

function MatrixConfigHeader({
	currentStep,
	error,
	fileExists,
	matrixPromptPath,
	steps
}: {
	currentStep: MatrixStepId
	error: string | null
	fileExists: boolean
	matrixPromptPath: string
	steps: MatrixStepId[]
}): ReactNode {
	return (
		<>
			<MatrixConfigShortcuts />
			<MatrixSummaryLine
				fileExists={fileExists}
				matrixPromptPath={matrixPromptPath}
			/>
			{error ? (
				<text
					fg={THEME.danger}
					selectable={false}>
					{error}
				</text>
			) : null}
			<MatrixStepStrip
				currentStep={currentStep}
				steps={steps}
			/>
		</>
	)
}

function MatrixConfigShortcuts(): ReactNode {
	return (
		<box
			flexDirection='row'
			gap={2}>
			<Shortcut
				command='ctrl+s'
				label='preview/save'
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

function MatrixSummaryLine({
	fileExists,
	matrixPromptPath
}: {
	fileExists: boolean
	matrixPromptPath: string
}): ReactNode {
	return (
		<box
			flexDirection='row'
			flexWrap='wrap'
			gap={1}>
			<MatrixSummarySegment
				label='path'
				value={shortenHomePath(matrixPromptPath)}
			/>
			<MatrixSummarySegment
				label='mode'
				value={fileExists ? 'overwrite' : 'create'}
			/>
		</box>
	)
}

function MatrixSummarySegment({ label, value }: { label: string; value: string }): ReactNode {
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
				selectable={false}
				wrapMode='none'>
				{value}
			</text>
		</box>
	)
}

function MatrixStepStrip({ currentStep, steps }: { currentStep: MatrixStepId; steps: MatrixStepId[] }): ReactNode {
	return (
		<box
			flexDirection='row'
			flexWrap='wrap'
			gap={2}>
			{steps.map(step => (
				<box
					flexDirection='row'
					gap={1}
					key={step}>
					<text
						fg={step === currentStep ? THEME.focusAccent : THEME.muted}
						selectable={false}
						wrapMode='none'>
						·
					</text>
					<text
						fg={step === currentStep ? THEME.focusAccent : THEME.muted}
						selectable={false}
						wrapMode='none'>
						{getMatrixStepLabel(step)}
					</text>
				</box>
			))}
		</box>
	)
}

function MatrixConfigStepContent({
	currentField,
	currentStep,
	customInstructionsEpoch,
	customInstructionsRef,
	draft,
	fileExists,
	matrixPromptPath,
	onAdvance,
	onCustomInstructionsChange,
	onSelectField,
	previewContent,
	selectedIndexes
}: {
	currentField: MatrixFocusField
	currentStep: MatrixStepId
	customInstructionsEpoch: number
	customInstructionsRef: { current: TextareaRenderable | null }
	draft: MatrixDraft
	fileExists: boolean
	matrixPromptPath: string
	onAdvance: () => void
	onCustomInstructionsChange: () => void
	onSelectField: (field: MatrixSelectField, value: string) => void
	previewContent: string
	selectedIndexes: Record<MatrixSelectField, number>
}): ReactNode {
	switch (currentStep) {
		case 'tone':
			return (
				<>
					<MatrixPresetSection
						currentField={currentField}
						explanation='Shape how the agent sounds and how closely it collaborates with the user.'
						field='personality'
						onAdvance={onAdvance}
						onSelectField={onSelectField}
						selectedIndex={selectedIndexes.personality}
						title='Personality'
					/>
					<MatrixPresetSection
						currentField={currentField}
						explanation='Decide how compact or expansive responses should be by default.'
						field='verbosity'
						onAdvance={onAdvance}
						onSelectField={onSelectField}
						selectedIndex={selectedIndexes.verbosity}
						title='Verbosity'
					/>
					<MatrixPresetSection
						currentField={currentField}
						explanation='Decide whether the agent should feel like a pair, a teacher, or a more independent operator.'
						field='collaboration'
						onAdvance={onAdvance}
						onSelectField={onSelectField}
						selectedIndex={selectedIndexes.collaboration}
						title='Collaboration'
					/>
				</>
			)
		case 'autonomy':
			return (
				<>
					<MatrixPresetSection
						currentField={currentField}
						explanation='Choose how much initiative the agent should take without waiting for more instruction.'
						field='initiative'
						onAdvance={onAdvance}
						onSelectField={onSelectField}
						selectedIndex={selectedIndexes.initiative}
						title='Initiative'
					/>
					<MatrixPresetSection
						currentField={currentField}
						explanation='Set how much upfront planning the agent should do before acting.'
						field='planningDepth'
						onAdvance={onAdvance}
						onSelectField={onSelectField}
						selectedIndex={selectedIndexes.planningDepth}
						title='Planning Depth'
					/>
					<MatrixPresetSection
						currentField={currentField}
						explanation='Control when the agent should pause to surface non-obvious tradeoffs.'
						field='escalationThreshold'
						onAdvance={onAdvance}
						onSelectField={onSelectField}
						selectedIndex={selectedIndexes.escalationThreshold}
						title='Escalation Threshold'
					/>
				</>
			)
		case 'risk':
			return (
				<>
					<MatrixPresetSection
						currentField={currentField}
						explanation='Choose how much change or uncertainty the agent should tolerate.'
						field='riskPosture'
						onAdvance={onAdvance}
						onSelectField={onSelectField}
						selectedIndex={selectedIndexes.riskPosture}
						title='Risk Posture'
					/>
					<MatrixPresetSection
						currentField={currentField}
						explanation='Decide how conservative the agent should be about asking before impactful actions.'
						field='approvalConservatism'
						onAdvance={onAdvance}
						onSelectField={onSelectField}
						selectedIndex={selectedIndexes.approvalConservatism}
						title='Approval Conservatism'
					/>
					<MatrixPresetSection
						currentField={currentField}
						explanation='Control how explicitly assumptions should be surfaced to the user.'
						field='assumptionStyle'
						onAdvance={onAdvance}
						onSelectField={onSelectField}
						selectedIndex={selectedIndexes.assumptionStyle}
						title='Assumption Style'
					/>
				</>
			)
		case 'engineering':
			return (
				<>
					<MatrixPresetSection
						currentField={currentField}
						explanation='Set the expected quality bar for implementation choices.'
						field='codeQuality'
						onAdvance={onAdvance}
						onSelectField={onSelectField}
						selectedIndex={selectedIndexes.codeQuality}
						title='Code Quality'
					/>
					<MatrixPresetSection
						currentField={currentField}
						explanation='Decide how strongly the agent should push for test coverage and verification.'
						field='testingExpectation'
						onAdvance={onAdvance}
						onSelectField={onSelectField}
						selectedIndex={selectedIndexes.testingExpectation}
						title='Testing Expectation'
					/>
					<MatrixPresetSection
						currentField={currentField}
						explanation='Define how rigorous the agent should be when reviewing for bugs, regressions, and missing checks.'
						field='reviewPosture'
						onAdvance={onAdvance}
						onSelectField={onSelectField}
						selectedIndex={selectedIndexes.reviewPosture}
						title='Review Posture'
					/>
				</>
			)
		case 'output':
			return (
				<>
					<MatrixPresetSection
						currentField={currentField}
						explanation='Control whether answers should prefer prose, lists, or a mix of both.'
						field='responseShape'
						onAdvance={onAdvance}
						onSelectField={onSelectField}
						selectedIndex={selectedIndexes.responseShape}
						title='Response Shape'
					/>
					<MatrixPresetSection
						currentField={currentField}
						explanation='Choose how heavily the agent should lean on formatting and structure.'
						field='formattingStyle'
						onAdvance={onAdvance}
						onSelectField={onSelectField}
						selectedIndex={selectedIndexes.formattingStyle}
						title='Formatting Style'
					/>
					<MatrixPresetSection
						currentField={currentField}
						explanation='Decide how much explanation depth should be included by default.'
						field='explanationDepth'
						onAdvance={onAdvance}
						onSelectField={onSelectField}
						selectedIndex={selectedIndexes.explanationDepth}
						title='Explanation Depth'
					/>
				</>
			)
		case 'custom':
			return (
				<MatrixCustomInstructionsSection
					currentField={currentField}
					customInstructionsEpoch={customInstructionsEpoch}
					customInstructionsRef={customInstructionsRef}
					initialValue={draft.customInstructions}
					onCustomInstructionsChange={onCustomInstructionsChange}
				/>
			)
		case 'preview':
			return (
				<MatrixPreviewSection
					fileExists={fileExists}
					matrixPromptPath={matrixPromptPath}
					previewContent={previewContent}
				/>
			)
	}
}

function MatrixPresetSection({
	currentField,
	explanation,
	field,
	onAdvance,
	onSelectField,
	selectedIndex,
	title
}: {
	currentField: MatrixFocusField
	explanation: string
	field: MatrixSelectField
	onAdvance: () => void
	onSelectField: (field: MatrixSelectField, value: string) => void
	selectedIndex: number
	title: string
}): ReactNode {
	const options = toSelectOptions(getMatrixFieldOptions(field))
	const active = currentField === field

	return (
		<box
			flexDirection='column'
			gap={1}>
			<SectionTitle
				active={active}
				label={title}
			/>
			<SectionExplanation
				active={active}
				text={explanation}
			/>
			<MatrixSelectField
				active={active}
				currentField={currentField}
				field={field}
				onAdvance={onAdvance}
				onSelectField={onSelectField}
				options={options}
				selectedIndex={selectedIndex}
			/>
		</box>
	)
}

function MatrixSelectField({
	active,
	currentField,
	field,
	onAdvance,
	onSelectField,
	options,
	selectedIndex
}: {
	active: boolean
	currentField: MatrixFocusField
	field: MatrixSelectField
	onAdvance: () => void
	onSelectField: (field: MatrixSelectField, value: string) => void
	options: SelectOption[]
	selectedIndex: number
}): ReactNode {
	return (
		<AppSelect
			emphasized={active}
			focused={currentField === field}
			height={Math.max(3, Math.min(5, options.length + 1))}
			onCommit={onAdvance}
			onSelect={(_, option) => {
				if (typeof option?.value === 'string') {
					onSelectField(field, option.value)
				}
			}}
			options={options}
			selectedIndex={selectedIndex}
		/>
	)
}

function MatrixCustomInstructionsSection({
	currentField,
	customInstructionsEpoch,
	customInstructionsRef,
	initialValue,
	onCustomInstructionsChange
}: {
	currentField: MatrixFocusField
	customInstructionsEpoch: number
	customInstructionsRef: { current: TextareaRenderable | null }
	initialValue: string
	onCustomInstructionsChange: () => void
}): ReactNode {
	return (
		<box
			flexDirection='column'
			gap={1}>
			<SectionTitle
				active={currentField === 'customInstructions'}
				label='Custom Instructions'
			/>
			<SectionExplanation
				active={currentField === 'customInstructions'}
				text='Add any extra rules or context that the presets do not cover. This text will be inserted verbatim.'
			/>
			<FieldLabel
				active={currentField === 'customInstructions'}
				label='Additional Instructions'
			/>
			<AppTextarea
				focused={currentField === 'customInstructions'}
				height={8}
				initialValue={initialValue}
				keyBindings={[]}
				onContentChange={onCustomInstructionsChange}
				onSubmit={() => {}}
				placeholder='Add any custom behavior, constraints, or style notes...'
				textareaKey={`matrix-custom:${customInstructionsEpoch}`}
				textareaRef={renderable => {
					customInstructionsRef.current = renderable
					configureShortcutFriendlyField(renderable)
				}}
			/>
		</box>
	)
}

function MatrixPreviewSection({
	fileExists,
	matrixPromptPath,
	previewContent
}: {
	fileExists: boolean
	matrixPromptPath: string
	previewContent: string
}): ReactNode {
	return (
		<box
			flexDirection='column'
			gap={1}>
			<SectionTitle label='Preview' />
			<SectionExplanation text='Review the generated MATRIX.md below. Press ctrl+s from this step to write the file.' />
			{fileExists ? (
				<text
					fg={THEME.warning}
					selectable={false}>
					Existing MATRIX.md will be replaced at {shortenHomePath(matrixPromptPath)}.
				</text>
			) : (
				<text
					fg={THEME.summaryAccent}
					selectable={false}>
					MATRIX.md will be created at {shortenHomePath(matrixPromptPath)}.
				</text>
			)}
			<box
				backgroundColor={THEME.panelRaised}
				flexDirection='column'
				gap={0}
				paddingBottom={RHYTHM.panelY}
				paddingLeft={RHYTHM.panelX}
				paddingRight={RHYTHM.panelX}
				paddingTop={RHYTHM.panelY}
				width='100%'>
				{previewContent.split(/\r?\n/).map((line, index) => (
					<text
						fg={THEME.offWhite}
						key={`matrix-preview:${index}`}
						selectable>
						{line.length > 0 ? line : ' '}
					</text>
				))}
			</box>
		</box>
	)
}
