import { useTerminalDimensions } from '@opentui/react'
import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'

import type { MatrixDraft } from '../../../lib/matrix-config/fields'
import type { MatrixFocusField, MatrixSelectField, MatrixStepId } from '../../../lib/matrix-config/types'
import {
	buildDefaultMatrixDraft,
	findMatrixOptionIndex,
	generateMatrixMarkdown,
	getMatrixStepFocusFields,
	MATRIX_STEPS
} from '../../../lib/matrix-config/utils'

type DraftValueField = keyof MatrixDraft

export type MatrixConfigState = {
	advanceWizardGroup: () => void
	currentField: MatrixFocusField
	currentStep: MatrixStepId
	customInstructionsEpoch: number
	draft: MatrixDraft
	error: string | null
	fileExists: boolean
	focusFields: MatrixFocusField[]
	formHeight: number
	matrixPromptPath: string
	previewContent: string
	resetToInitial: () => void
	setError: Dispatch<SetStateAction<string | null>>
	setFocusIndex: Dispatch<SetStateAction<number>>
	setStepIndex: Dispatch<SetStateAction<number>>
	steps: MatrixStepId[]
	updateDraftField: (field: DraftValueField, value: string) => void
	updateSelectField: (field: MatrixSelectField, value: string) => void
	selectedIndexes: Record<MatrixSelectField, number>
}

export function useMatrixConfigState(matrixPromptPath: string, fileExists: boolean): MatrixConfigState {
	const { height } = useTerminalDimensions()
	const initialDraft = useMemo(() => buildDefaultMatrixDraft(), [])
	const [draft, setDraft] = useState(initialDraft)
	const [error, setError] = useState<string | null>(null)
	const [stepIndex, setStepIndex] = useState(0)
	const [focusIndex, setFocusIndex] = useState(0)
	const [customInstructionsEpoch, setCustomInstructionsEpoch] = useState(0)
	const steps = MATRIX_STEPS
	const currentStep: MatrixStepId = steps[stepIndex] ?? 'tone'
	const focusFields = getMatrixStepFocusFields(currentStep)
	const currentField = focusFields[Math.min(focusIndex, Math.max(0, focusFields.length - 1))] ?? 'preview'
	const previewContent = generateMatrixMarkdown(draft)
	const selectedIndexes = {
		approvalConservatism: findMatrixOptionIndex('approvalConservatism', draft.approvalConservatism),
		assumptionStyle: findMatrixOptionIndex('assumptionStyle', draft.assumptionStyle),
		codeQuality: findMatrixOptionIndex('codeQuality', draft.codeQuality),
		collaboration: findMatrixOptionIndex('collaboration', draft.collaboration),
		escalationThreshold: findMatrixOptionIndex('escalationThreshold', draft.escalationThreshold),
		explanationDepth: findMatrixOptionIndex('explanationDepth', draft.explanationDepth),
		formattingStyle: findMatrixOptionIndex('formattingStyle', draft.formattingStyle),
		initiative: findMatrixOptionIndex('initiative', draft.initiative),
		personality: findMatrixOptionIndex('personality', draft.personality),
		planningDepth: findMatrixOptionIndex('planningDepth', draft.planningDepth),
		responseShape: findMatrixOptionIndex('responseShape', draft.responseShape),
		reviewPosture: findMatrixOptionIndex('reviewPosture', draft.reviewPosture),
		riskPosture: findMatrixOptionIndex('riskPosture', draft.riskPosture),
		testingExpectation: findMatrixOptionIndex('testingExpectation', draft.testingExpectation),
		verbosity: findMatrixOptionIndex('verbosity', draft.verbosity)
	} satisfies Record<MatrixSelectField, number>

	const clearError = (): void => {
		if (error) {
			setError(null)
		}
	}

	const updateDraftField = (field: DraftValueField, value: string): void => {
		setDraft(current => ({ ...current, [field]: value }))
		clearError()
	}

	const advanceWizardGroup = (): void => {
		if (focusIndex < focusFields.length - 1) {
			setFocusIndex(value => value + 1)
			return
		}

		if (stepIndex < steps.length - 1) {
			setStepIndex(value => value + 1)
			setFocusIndex(0)
		}
	}

	const resetToInitial = (): void => {
		setDraft(initialDraft)
		setStepIndex(0)
		setFocusIndex(0)
		setError(null)
		setCustomInstructionsEpoch(value => value + 1)
	}

	return {
		advanceWizardGroup,
		currentField,
		currentStep,
		customInstructionsEpoch,
		draft,
		error,
		fileExists,
		focusFields,
		formHeight: Math.max(12, height - 18),
		matrixPromptPath,
		previewContent,
		resetToInitial,
		selectedIndexes,
		setError,
		setFocusIndex,
		setStepIndex,
		steps,
		updateDraftField,
		updateSelectField: updateDraftField
	}
}
