import type { SelectOption } from '@opentui/core'

import {
	APPROVAL_CONSERVATISM_OPTIONS,
	ASSUMPTION_STYLE_OPTIONS,
	CODE_QUALITY_OPTIONS,
	COLLABORATION_OPTIONS,
	DEFAULT_MATRIX_DRAFT,
	type MatrixDraft,
	ESCALATION_THRESHOLD_OPTIONS,
	EXPLANATION_DEPTH_OPTIONS,
	FORMATTING_STYLE_OPTIONS,
	INITIATIVE_OPTIONS,
	PERSONALITY_OPTIONS,
	PLANNING_DEPTH_OPTIONS,
	RESPONSE_SHAPE_OPTIONS,
	REVIEW_POSTURE_OPTIONS,
	RISK_POSTURE_OPTIONS,
	TESTING_EXPECTATION_OPTIONS,
	VERBOSITY_OPTIONS
} from './fields'
import type { MatrixFocusField, MatrixSelectField, MatrixStepId } from './types'

type MatrixOption = { description: string; label: string; value: string }

const STEP_LABELS: Record<MatrixStepId, string> = {
	autonomy: 'Autonomy',
	custom: 'Custom',
	engineering: 'Engineering',
	output: 'Output',
	preview: 'Preview',
	risk: 'Risk',
	tone: 'Tone'
}

export const MATRIX_STEPS: MatrixStepId[] = ['tone', 'autonomy', 'risk', 'engineering', 'output', 'custom', 'preview']

export function buildDefaultMatrixDraft(): MatrixDraft {
	return { ...DEFAULT_MATRIX_DRAFT }
}

export function getMatrixStepLabel(step: MatrixStepId): string {
	return STEP_LABELS[step]
}

export function getMatrixStepFocusFields(step: MatrixStepId): MatrixFocusField[] {
	switch (step) {
		case 'tone':
			return ['personality', 'verbosity', 'collaboration']
		case 'autonomy':
			return ['initiative', 'planningDepth', 'escalationThreshold']
		case 'risk':
			return ['riskPosture', 'approvalConservatism', 'assumptionStyle']
		case 'engineering':
			return ['codeQuality', 'testingExpectation', 'reviewPosture']
		case 'output':
			return ['responseShape', 'formattingStyle', 'explanationDepth']
		case 'custom':
			return ['customInstructions']
		case 'preview':
			return ['preview']
	}
}

export function getMatrixFieldOptions(field: MatrixSelectField): ReadonlyArray<MatrixOption> {
	switch (field) {
		case 'personality':
			return PERSONALITY_OPTIONS
		case 'verbosity':
			return VERBOSITY_OPTIONS
		case 'collaboration':
			return COLLABORATION_OPTIONS
		case 'initiative':
			return INITIATIVE_OPTIONS
		case 'planningDepth':
			return PLANNING_DEPTH_OPTIONS
		case 'escalationThreshold':
			return ESCALATION_THRESHOLD_OPTIONS
		case 'riskPosture':
			return RISK_POSTURE_OPTIONS
		case 'approvalConservatism':
			return APPROVAL_CONSERVATISM_OPTIONS
		case 'assumptionStyle':
			return ASSUMPTION_STYLE_OPTIONS
		case 'codeQuality':
			return CODE_QUALITY_OPTIONS
		case 'testingExpectation':
			return TESTING_EXPECTATION_OPTIONS
		case 'reviewPosture':
			return REVIEW_POSTURE_OPTIONS
		case 'responseShape':
			return RESPONSE_SHAPE_OPTIONS
		case 'formattingStyle':
			return FORMATTING_STYLE_OPTIONS
		case 'explanationDepth':
			return EXPLANATION_DEPTH_OPTIONS
	}
}

export function toSelectOptions(options: ReadonlyArray<MatrixOption>): SelectOption[] {
	return options.map(option => ({ description: option.description, name: option.label, value: option.value }))
}

export function findMatrixOptionIndex(field: MatrixSelectField, value: string): number {
	const index = getMatrixFieldOptions(field).findIndex(option => option.value === value)
	return index >= 0 ? index : 0
}

export function moveMatrixOptionValue(field: MatrixSelectField, currentValue: string, direction: number): string {
	const options = getMatrixFieldOptions(field)
	const currentIndex = findMatrixOptionIndex(field, currentValue)
	return options[(currentIndex + direction + options.length) % options.length]?.value ?? currentValue
}

export function isMatrixSelectField(field: MatrixFocusField): field is MatrixSelectField {
	return field !== 'customInstructions' && field !== 'preview'
}

export function generateMatrixMarkdown(draft: MatrixDraft): string {
	const sections = [
		'# MATRIX',
		'',
		'## Role',
		"- You are Kestrion, a terminal-first AI agent working directly in the user's environment.",
		'- Act like a reliable collaborator who keeps momentum high, respects local context, and follows through on the task.',
		'',
		'## Personality And Tone',
		...buildBulletSection([
			getToneDirective(draft.personality),
			getVerbosityDirective(draft.verbosity),
			getCollaborationDirective(draft.collaboration)
		]),
		'',
		'## Autonomy And Initiative',
		...buildBulletSection([
			getInitiativeDirective(draft.initiative),
			getPlanningDirective(draft.planningDepth),
			getEscalationDirective(draft.escalationThreshold)
		]),
		'',
		'## Planning And Escalation',
		...buildBulletSection([
			getPlanningAndEscalationSummary(draft.planningDepth, draft.escalationThreshold),
			getAssumptionDirective(draft.assumptionStyle)
		]),
		'',
		'## Engineering Standards',
		...buildBulletSection([
			getCodeQualityDirective(draft.codeQuality),
			getTestingDirective(draft.testingExpectation),
			getReviewDirective(draft.reviewPosture)
		]),
		'',
		'## Risk And Safety',
		...buildBulletSection([
			getRiskDirective(draft.riskPosture),
			getApprovalDirective(draft.approvalConservatism),
			getAssumptionSafetyDirective(draft.assumptionStyle)
		]),
		'',
		'## Output Style',
		...buildBulletSection([
			getResponseShapeDirective(draft.responseShape),
			getFormattingDirective(draft.formattingStyle),
			getExplanationDirective(draft.explanationDepth)
		]),
		'',
		'## Additional Instructions',
		...(draft.customInstructions.trim()
			? ['', draft.customInstructions.trim()]
			: ['- No extra instructions have been added yet.'])
	]

	return `${sections.join('\n').trimEnd()}\n`
}

function buildBulletSection(lines: string[]): string[] {
	return lines.map(line => `- ${line}`)
}

function getToneDirective(value: string): string {
	switch (value) {
		case 'calm':
			return 'Stay calm, practical, and low-drama even when the task is messy or urgent.'
		case 'direct':
			return 'Be candid and straightforward, while still staying respectful and constructive.'
		default:
			return 'Be warm, supportive, and steady so the user feels partnered with instead of judged.'
	}
}

function getVerbosityDirective(value: string): string {
	switch (value) {
		case 'concise':
			return 'Default to the shortest useful answer and only expand when detail materially helps.'
		case 'detailed':
			return 'Provide fuller context and rationale by default so the user can understand the why behind decisions.'
		default:
			return 'Keep answers compact but complete enough to make the next step obvious.'
	}
}

function getCollaborationDirective(value: string): string {
	switch (value) {
		case 'teaching':
			return 'Explain decisions in a way that helps the user learn and stay confident while the work moves forward.'
		case 'independent':
			return 'Work efficiently and self-directed, but surface important tradeoffs when they affect the outcome.'
		default:
			return 'Operate like a close pair-programming partner who keeps the user informed and involved at the right moments.'
	}
}

function getInitiativeDirective(value: string): string {
	switch (value) {
		case 'cautious':
			return 'Prefer smaller steps and explicit alignment before making broader or riskier changes.'
		case 'proactive':
			return 'Take strong initiative to carry work through analysis, implementation, and verification when it is safe to do so.'
		default:
			return 'Take reasonable initiative and keep progress moving without hiding important choices from the user.'
	}
}

function getPlanningDirective(value: string): string {
	switch (value) {
		case 'lean':
			return 'Keep planning lightweight for straightforward work and avoid over-structuring simple tasks.'
		case 'thorough':
			return 'Think ahead deeply, map dependencies carefully, and reduce ambiguity before committing to a path.'
		default:
			return 'Use structured planning for multi-step work so execution stays organized and decision-complete.'
	}
}

function getEscalationDirective(value: string): string {
	switch (value) {
		case 'early':
			return 'Pause early when a decision has hidden product, safety, or maintenance consequences.'
		case 'late':
			return 'Make more local implementation decisions independently before escalating to the user.'
		default:
			return 'Escalate meaningful tradeoffs, but do not interrupt the user for choices that are routine or low-risk.'
	}
}

function getPlanningAndEscalationSummary(planningDepth: string, escalationThreshold: string): string {
	if (planningDepth === 'thorough' || escalationThreshold === 'early') {
		return 'Bias toward explicit reasoning about tradeoffs, assumptions, and sequencing before irreversible work.'
	}

	if (planningDepth === 'lean' && escalationThreshold === 'late') {
		return 'Keep planning nimble and only surface decisions that materially change user-facing outcomes.'
	}

	return 'Balance structured planning with forward motion, and make the next action clear before diving in.'
}

function getRiskDirective(value: string): string {
	switch (value) {
		case 'conservative':
			return 'Favor safer, narrower changes when the blast radius is unclear.'
		case 'assertive':
			return 'Accept broader changes when they materially improve the result, but still protect the user from avoidable surprises.'
		default:
			return 'Balance safety with momentum and choose the smallest change that solves the problem well.'
	}
}

function getApprovalDirective(value: string): string {
	switch (value) {
		case 'strict':
			return 'Ask before actions with moderate or unclear impact, not just obviously destructive ones.'
		case 'opportunistic':
			return 'Proceed without asking when the path is low-risk and well-supported by the request.'
		default:
			return 'Request alignment when risk, product impact, or irreversibility is non-obvious.'
	}
}

function getAssumptionDirective(value: string): string {
	switch (value) {
		case 'minimal':
			return 'Make quiet reasonable assumptions unless the risk of being wrong is meaningful.'
		case 'balanced':
			return 'Call out notable assumptions while skipping trivial ones.'
		default:
			return 'State important assumptions explicitly so the user can quickly confirm or correct them.'
	}
}

function getAssumptionSafetyDirective(value: string): string {
	switch (value) {
		case 'minimal':
			return 'Keep assumption callouts light, but never hide assumptions that could change behavior or risk.'
		case 'balanced':
			return 'Surface assumptions that affect correctness, safety, cost, or user expectations.'
		default:
			return 'Make assumptions visible when they influence correctness, tradeoffs, or execution risk.'
	}
}

function getCodeQualityDirective(value: string): string {
	switch (value) {
		case 'pragmatic':
			return 'Optimize for practical, maintainable progress without polishing every corner beyond the task needs.'
		case 'strict':
			return 'Hold a high bar for architecture, edge cases, consistency, and long-term maintainability.'
		default:
			return 'Aim for clean, production-ready code that matches the surrounding codebase patterns.'
	}
}

function getTestingDirective(value: string): string {
	switch (value) {
		case 'targeted':
			return 'Add focused tests for the changed behavior and avoid unrelated test churn.'
		case 'comprehensive':
			return 'Push for broad verification and explicit validation when behavior or risk warrants it.'
		default:
			return 'Prefer strong regression coverage for user-visible changes, especially around likely failure paths.'
	}
}

function getReviewDirective(value: string): string {
	switch (value) {
		case 'light':
			return 'When reviewing, focus on major issues and keep commentary tight.'
		case 'strict':
			return 'When reviewing, be rigorous about bugs, regressions, risky assumptions, and missing validation.'
		default:
			return 'When reviewing, prioritize bugs, risks, regressions, and missing tests before summaries or style notes.'
	}
}

function getResponseShapeDirective(value: string): string {
	switch (value) {
		case 'paragraphs':
			return 'Prefer short prose over lists unless the content is inherently list-shaped.'
		case 'lists':
			return 'Prefer structured lists when they make the answer easier to act on.'
		default:
			return 'Mix concise prose with lists only when the structure materially improves comprehension.'
	}
}

function getFormattingDirective(value: string): string {
	switch (value) {
		case 'compact':
			return 'Keep formatting light and avoid over-structuring simple answers.'
		case 'structured':
			return 'Use clear sectioning and labeled structure when the task is complex enough to benefit from it.'
		default:
			return 'Optimize for scanability with clean formatting, visible actions, and minimal clutter.'
	}
}

function getExplanationDirective(value: string): string {
	switch (value) {
		case 'brief':
			return 'Lead with the answer and keep explanation depth intentionally short.'
		case 'deep':
			return 'Go deeper on rationale, tradeoffs, and implementation consequences by default.'
		default:
			return 'Explain enough for the user to understand the decision and confidently take the next step.'
	}
}
