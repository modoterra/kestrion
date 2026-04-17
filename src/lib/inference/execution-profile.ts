import type { ResolvedAppConfig } from '../config'
import type {
	ConversationCompactionRecord,
	ConversationRecord,
	InferenceEvents,
	InferenceMessage,
	InferenceRequest,
	MessageRecord
} from '../types'
import { buildRuntimeSystemPrompt } from './system-prompt'

const KIMI_K2P5_MODEL = 'accounts/fireworks/models/kimi-k2p5'
const KIMI_K2P5_TURBO_ROUTER = 'accounts/fireworks/routers/kimi-k2p5-turbo'

const GENERIC_PROFILE_ID = 'generic'
const KIMI_PROFILE_ID = 'kimi-k2p5'

const KIMI_INSTANT_MODE = {
	assistantAnchors: [
		'Continue from the existing conversation instead of restarting. Treat prior assistant turns as behavioral precedent, keep formatting and tool usage patterns stable, and make straightforward forward progress without unnecessary detours.'
	],
	id: 'instant',
	maxTokens: 2048,
	promptTruncateLength: 8000,
	reasoningEffort: 'none',
	temperature: 0.6,
	topP: 0.95
} as const

const KIMI_THINKING_MODE = {
	assistantAnchors: [
		'Continue from the existing conversation instead of restarting. Treat prior assistant turns as behavioral precedent, keep formatting and tool usage patterns stable, and reason more deeply up front for complex requests before committing to a path.'
	],
	id: 'thinking',
	maxTokens: 4096,
	promptTruncateLength: 12000,
	reasoningEffort: 'medium',
	temperature: 1.0,
	topP: 0.95
} as const

type PreparedInferenceRequest = {
	modeId: 'generic' | 'instant' | 'thinking'
	profileId: 'generic' | 'kimi-k2p5'
	request: InferenceRequest
}

type RequestBuildArgs = {
	compaction?: ConversationCompactionRecord | null
	config: ResolvedAppConfig
	conversation: ConversationRecord
	events?: InferenceEvents
	messages: MessageRecord[]
	signal?: AbortSignal
}

type CompactionRequestBuildArgs = {
	config: ResolvedAppConfig
	conversation: ConversationRecord
	existingSummary?: string | null
	messagesToCompact: MessageRecord[]
	signal?: AbortSignal
}

type ExecutionModeConfig = {
	assistantAnchors: readonly string[]
	id: 'instant' | 'thinking'
	maxTokens: number
	promptTruncateLength: number
	reasoningEffort?: string
	temperature: number
	topP: number
}

type ModelExecutionProfile = {
	id: 'kimi-k2p5'
	modelId: string
	resolveMode: (messages: MessageRecord[]) => ExecutionModeConfig
}

const KIMI_PROFILE = { id: KIMI_PROFILE_ID, modelId: KIMI_K2P5_MODEL, resolveMode: resolveKimiMode } as const

const MODEL_EXECUTION_PROFILES = new Map<string, ModelExecutionProfile>([
	[KIMI_K2P5_MODEL, KIMI_PROFILE],
	[KIMI_K2P5_TURBO_ROUTER, { ...KIMI_PROFILE, modelId: KIMI_K2P5_TURBO_ROUTER }]
])

export type { PreparedInferenceRequest }

export function buildInferenceRequest(args: RequestBuildArgs): PreparedInferenceRequest {
	const providerConfig = args.config.providers.fireworks
	const compactionState = getCompactionRequestState(args.messages, args.compaction)
	const profile = MODEL_EXECUTION_PROFILES.get(args.conversation.model)

	if (!profile) {
		return {
			modeId: 'generic',
			profileId: GENERIC_PROFILE_ID,
			request: {
				events: args.events,
				maxTokens: providerConfig.maxTokens,
				messages: [
					{ content: buildRuntimeSystemPrompt(args.config.systemPrompt), role: 'system' },
					...compactionState.summaryMessages,
					...compactionState.historyMessages
				],
				model: args.conversation.model,
				promptTruncateLength: providerConfig.promptTruncateLength,
				signal: args.signal,
				temperature: providerConfig.temperature,
				toolMode: 'enabled'
			}
		}
	}

	const mode = profile.resolveMode(args.messages)

	return {
		modeId: mode.id,
		profileId: profile.id,
		request: {
			events: args.events,
			maxTokens: mode.maxTokens,
			messages: [
				{ content: buildRuntimeSystemPrompt(args.config.systemPrompt), role: 'system' },
				...compactionState.summaryMessages,
				...mode.assistantAnchors.map((content): InferenceMessage => ({ content, role: 'assistant' })),
				...compactionState.historyMessages
			],
			model: args.conversation.model,
			promptTruncateLength: mode.promptTruncateLength,
			reasoningEffort: mode.reasoningEffort,
			signal: args.signal,
			temperature: mode.temperature,
			toolMode: 'enabled',
			topP: mode.topP
		}
	}
}

export function getPreparedInferenceUsageChars(args: RequestBuildArgs): number {
	return JSON.stringify(buildInferenceRequest(args).request.messages).length
}

export function buildCompactionRequest(args: CompactionRequestBuildArgs): InferenceRequest {
	const providerConfig = args.config.providers.fireworks

	return {
		maxTokens: Math.min(providerConfig.maxTokens, 768),
		messages: [
			{
				content: buildCompactionSystemPrompt(args.config.systemPrompt),
				role: 'system'
			},
			{
				content: buildCompactionUserPrompt(args.messagesToCompact, args.existingSummary),
				role: 'user'
			}
		],
		model: args.conversation.model,
		promptTruncateLength: providerConfig.promptTruncateLength,
		signal: args.signal,
		temperature: 0.2,
		toolMode: 'disabled'
	}
}

export function getSerializedInferenceHistoryChars(messages: MessageRecord[]): number {
	return JSON.stringify(toInferenceHistory(messages)).length
}

function toInferenceHistory(messages: MessageRecord[]): InferenceMessage[] {
	return messages.map((message): InferenceMessage => ({ content: message.content, role: message.role }))
}

function getCompactionRequestState(
	messages: MessageRecord[],
	compaction: ConversationCompactionRecord | null | undefined
): { historyMessages: InferenceMessage[]; summaryMessages: InferenceMessage[] } {
	if (!compaction) {
		return { historyMessages: toInferenceHistory(messages), summaryMessages: [] }
	}

	const compactedThroughIndex = messages.findIndex(message => message.id === compaction.compactedThroughMessageId)
	if (compactedThroughIndex < 0) {
		return { historyMessages: toInferenceHistory(messages), summaryMessages: [] }
	}

	return {
		historyMessages: toInferenceHistory(messages.slice(compactedThroughIndex + 1)),
		summaryMessages: [{ content: `Conversation summary checkpoint\n\n${compaction.summary}`, role: 'system' }]
	}
}

function buildCompactionSystemPrompt(systemPrompt: string): string {
	return `${buildRuntimeSystemPrompt(
		systemPrompt
	)}\n\nCreate a compact checkpoint summary for prior conversation context. Preserve goals, decisions, constraints, user preferences, active files or paths, and unresolved work. Be factual, concise, and non-redundant. Keep the summary under 1200 characters.`
}

function buildCompactionUserPrompt(messagesToCompact: MessageRecord[], existingSummary?: string | null): string {
	const sections = [
		'Update the conversation checkpoint summary using the material below.',
		existingSummary?.trim() ? `Existing checkpoint summary:\n${existingSummary.trim()}` : 'Existing checkpoint summary:\n(none)',
		`Newly compacted conversation segment:\n${renderConversationSegment(messagesToCompact)}`
	]

	return sections.join('\n\n')
}

function renderConversationSegment(messages: MessageRecord[]): string {
	return messages
		.map(message => {
			const normalizedContent = message.content.trim() || '(empty)'
			return `${message.role.toUpperCase()}:\n${normalizedContent}`
		})
		.join('\n\n')
}

function resolveKimiMode(messages: MessageRecord[]): ExecutionModeConfig {
	return selectKimiMode(messages) === 'thinking' ? KIMI_THINKING_MODE : KIMI_INSTANT_MODE
}

function selectKimiMode(messages: MessageRecord[]): 'instant' | 'thinking' {
	const latestUserPrompt = getLatestUserPrompt(messages)
	if (!latestUserPrompt) {
		return 'instant'
	}

	const normalizedPrompt = latestUserPrompt.toLowerCase()
	let score = 0

	if (
		hasPattern(normalizedPrompt, [/\bstep[- ]by[- ]step\b/, /\bplan\b/, /\broadmap\b/, /\bstrategy\b/, /\boutline\b/])
	) {
		score += 2
	}

	if (
		hasPattern(normalizedPrompt, [
			/\barchitecture\b/,
			/\btrade[- ]?offs?\b/,
			/\bcompare\b/,
			/\bdesign\b/,
			/\bpros and cons\b/
		])
	) {
		score += 2
	}

	if (
		hasPattern(normalizedPrompt, [
			/\bdebug\b/,
			/\bdiagnos(?:e|ing|is)\b/,
			/\broot cause\b/,
			/\bhypoth(?:esis|eses)\b/,
			/\binvestigat(?:e|ing|ion)\b/,
			/\bwhy (?:is|does|did|was|were)\b/
		])
	) {
		score += 2
	}

	if (hasPattern(normalizedPrompt, [/\breview\b/, /\baudit\b/, /\banaly(?:ze|sis)\b/, /\binspect\b/])) {
		score += 2
	}

	if (latestUserPrompt.length >= 420) {
		score += 1
	}

	if (hasStructuredPrompt(latestUserPrompt)) {
		score += 1
	}

	if ((latestUserPrompt.match(/\?/g) ?? []).length >= 2) {
		score += 1
	}

	if (hasBriefFollowUpSignal(messages, latestUserPrompt, normalizedPrompt)) {
		score -= 2
	}

	return score >= 2 ? 'thinking' : 'instant'
}

function getLatestUserPrompt(messages: MessageRecord[]): string {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index]
		if (message?.role === 'user') {
			return message.content.trim()
		}
	}

	return ''
}

function hasPattern(value: string, patterns: RegExp[]): boolean {
	return patterns.some(pattern => pattern.test(value))
}

function hasStructuredPrompt(value: string): boolean {
	return /\n\s*(?:[-*]|\d+[.)])\s+/m.test(value) || value.split(/\r?\n/).filter(Boolean).length >= 4
}

function hasBriefFollowUpSignal(messages: MessageRecord[], prompt: string, normalizedPrompt: string): boolean {
	const hasRecentAssistantTurn = messages.slice(-6).some(message => message.role === 'assistant')
	if (!hasRecentAssistantTurn || prompt.length > 160) {
		return false
	}

	if (
		hasPattern(normalizedPrompt, [
			/\bplan\b/,
			/\barchitecture\b/,
			/\btrade[- ]?offs?\b/,
			/\bdebug\b/,
			/\bdiagnos(?:e|ing|is)\b/,
			/\breview\b/,
			/\baudit\b/
		])
	) {
		return false
	}

	return /^(?:now|next|also|continue|please|just|fix|update|format|reformat|rewrite|rename|shorten|expand|apply|implement|make it|turn this into)\b/i.test(
		prompt
	)
}
