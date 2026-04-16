type MatrixOption<TValue extends string> = { description: string; label: string; value: TValue }

export type MatrixDraft = {
	approvalConservatism: string
	assumptionStyle: string
	codeQuality: string
	collaboration: string
	customInstructions: string
	escalationThreshold: string
	explanationDepth: string
	formattingStyle: string
	initiative: string
	personality: string
	planningDepth: string
	responseShape: string
	reviewPosture: string
	riskPosture: string
	testingExpectation: string
	verbosity: string
}

export const PERSONALITY_OPTIONS = [
	{ description: 'Warm, steady, and reassuring without losing honesty.', label: 'Supportive', value: 'supportive' },
	{ description: 'Calm, practical, and low-drama under pressure.', label: 'Calm', value: 'calm' },
	{ description: 'Straightforward and candid with minimal softening.', label: 'Direct', value: 'direct' }
] as const satisfies ReadonlyArray<MatrixOption<string>>

export const VERBOSITY_OPTIONS = [
	{ description: 'Default to the shortest useful response.', label: 'Concise', value: 'concise' },
	{ description: 'Use a compact but well-explained middle ground.', label: 'Balanced', value: 'balanced' },
	{ description: 'Provide extra context and rationale by default.', label: 'Detailed', value: 'detailed' }
] as const satisfies ReadonlyArray<MatrixOption<string>>

export const COLLABORATION_OPTIONS = [
	{ description: 'Act like a close pair-programming partner.', label: 'Paired', value: 'paired' },
	{ description: 'Explain decisions clearly and help onboard the user.', label: 'Teaching', value: 'teaching' },
	{ description: 'Stay efficient and self-directed unless needed.', label: 'Independent', value: 'independent' }
] as const satisfies ReadonlyArray<MatrixOption<string>>

export const INITIATIVE_OPTIONS = [
	{
		description: 'Prefer small steps and explicit confirmation before major changes.',
		label: 'Cautious',
		value: 'cautious'
	},
	{ description: 'Take reasonable initiative while surfacing tradeoffs.', label: 'Balanced', value: 'balanced' },
	{ description: 'Proactively drive work forward end-to-end when safe.', label: 'Proactive', value: 'proactive' }
] as const satisfies ReadonlyArray<MatrixOption<string>>

export const PLANNING_DEPTH_OPTIONS = [
	{ description: 'Plan lightly and move quickly for straightforward work.', label: 'Lean', value: 'lean' },
	{ description: 'Use structured plans for multi-step work.', label: 'Structured', value: 'structured' },
	{ description: 'Think ahead deeply and map dependencies carefully.', label: 'Thorough', value: 'thorough' }
] as const satisfies ReadonlyArray<MatrixOption<string>>

export const ESCALATION_THRESHOLD_OPTIONS = [
	{ description: 'Pause early when decisions have hidden consequences.', label: 'Early', value: 'early' },
	{ description: 'Escalate meaningful tradeoffs without over-interrupting.', label: 'Balanced', value: 'balanced' },
	{ description: 'Make more local decisions before asking the user.', label: 'Late', value: 'late' }
] as const satisfies ReadonlyArray<MatrixOption<string>>

export const RISK_POSTURE_OPTIONS = [
	{ description: 'Bias toward safety and minimal change surface.', label: 'Conservative', value: 'conservative' },
	{ description: 'Balance safety with momentum.', label: 'Balanced', value: 'balanced' },
	{ description: 'Accept more change when it materially improves the result.', label: 'Assertive', value: 'assertive' }
] as const satisfies ReadonlyArray<MatrixOption<string>>

export const APPROVAL_CONSERVATISM_OPTIONS = [
	{ description: 'Ask before actions with moderate or unclear blast radius.', label: 'Strict', value: 'strict' },
	{ description: 'Ask when risk is non-obvious or meaningfully user-facing.', label: 'Balanced', value: 'balanced' },
	{
		description: 'Proceed unless the action is clearly risky or destructive.',
		label: 'Opportunistic',
		value: 'opportunistic'
	}
] as const satisfies ReadonlyArray<MatrixOption<string>>

export const ASSUMPTION_STYLE_OPTIONS = [
	{ description: 'State assumptions explicitly and clearly.', label: 'Explicit', value: 'explicit' },
	{ description: 'State notable assumptions, skip trivial ones.', label: 'Balanced', value: 'balanced' },
	{ description: 'Make silent reasonable assumptions unless the risk is high.', label: 'Minimal', value: 'minimal' }
] as const satisfies ReadonlyArray<MatrixOption<string>>

export const CODE_QUALITY_OPTIONS = [
	{ description: 'Prefer practical changes with good enough polish.', label: 'Pragmatic', value: 'pragmatic' },
	{ description: 'Aim for clean, maintainable, production-ready work.', label: 'High', value: 'high' },
	{ description: 'Be exacting about architecture, edge cases, and quality bars.', label: 'Strict', value: 'strict' }
] as const satisfies ReadonlyArray<MatrixOption<string>>

export const TESTING_EXPECTATION_OPTIONS = [
	{ description: 'Add focused tests for changed behavior.', label: 'Targeted', value: 'targeted' },
	{ description: 'Prefer strong regression coverage for user-visible changes.', label: 'Strong', value: 'strong' },
	{
		description: 'Push for broad verification and explicit validation.',
		label: 'Comprehensive',
		value: 'comprehensive'
	}
] as const satisfies ReadonlyArray<MatrixOption<string>>

export const REVIEW_POSTURE_OPTIONS = [
	{ description: 'Flag major issues and keep reviews compact.', label: 'Light', value: 'light' },
	{ description: 'Prioritize bugs, risks, regressions, and gaps.', label: 'Balanced', value: 'balanced' },
	{ description: 'Be rigorous and skeptical when reviewing code.', label: 'Strict', value: 'strict' }
] as const satisfies ReadonlyArray<MatrixOption<string>>

export const RESPONSE_SHAPE_OPTIONS = [
	{ description: 'Prefer short paragraphs over lists.', label: 'Paragraphs', value: 'paragraphs' },
	{ description: 'Mix prose and lists based on the task.', label: 'Mixed', value: 'mixed' },
	{ description: 'Lean on lists and structured output when possible.', label: 'Lists', value: 'lists' }
] as const satisfies ReadonlyArray<MatrixOption<string>>

export const FORMATTING_STYLE_OPTIONS = [
	{ description: 'Keep formatting light and compact.', label: 'Compact', value: 'compact' },
	{ description: 'Optimize for scanability and clean structure.', label: 'Scannable', value: 'scannable' },
	{ description: 'Use more headings and explicit structure by default.', label: 'Structured', value: 'structured' }
] as const satisfies ReadonlyArray<MatrixOption<string>>

export const EXPLANATION_DEPTH_OPTIONS = [
	{ description: 'Give high-signal summaries first.', label: 'Brief', value: 'brief' },
	{ description: 'Explain enough for confident follow-through.', label: 'Balanced', value: 'balanced' },
	{ description: 'Go deeper on rationale and tradeoffs by default.', label: 'Deep', value: 'deep' }
] as const satisfies ReadonlyArray<MatrixOption<string>>

export const DEFAULT_MATRIX_DRAFT: MatrixDraft = {
	approvalConservatism: 'balanced',
	assumptionStyle: 'explicit',
	codeQuality: 'high',
	collaboration: 'paired',
	customInstructions: '',
	escalationThreshold: 'balanced',
	explanationDepth: 'balanced',
	formattingStyle: 'scannable',
	initiative: 'balanced',
	personality: 'supportive',
	planningDepth: 'structured',
	responseShape: 'mixed',
	reviewPosture: 'balanced',
	riskPosture: 'balanced',
	testingExpectation: 'strong',
	verbosity: 'balanced'
}
