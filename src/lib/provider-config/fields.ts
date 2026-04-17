export const FIREWORKS_BASE_URL = 'https://api.fireworks.ai/inference/v1'

export const PROVIDER_TABS = [
	{ description: 'fireworks.ai', id: 'fireworks', label: 'Fireworks' },
	{ description: 'Custom OpenAI-compatible endpoint', id: 'custom', label: 'Custom' }
] as const

export type ProviderTabId = (typeof PROVIDER_TABS)[number]['id']

export type ProviderDraft = {
	apiKey: string
	apiKeyEnv: string
	baseUrl: string
	compactAutoPromptChars: string
	compactAutoTurnThreshold: string
	compactTailTurns: string
	maxTokens: string
	model: string
	promptTruncateLength: string
	providerId?: ProviderTabId
	temperature: string
}

export const MAX_TOKEN_PRESETS = [
	{ description: 'Short replies', label: '512 tokens', value: '512' },
	{ description: 'Balanced default', label: '1024 tokens', value: '1024' },
	{ description: 'Longer answers', label: '2048 tokens', value: '2048' },
	{ description: 'Extended output', label: '4096 tokens', value: '4096' }
] as const

export const PROMPT_TRUNCATE_PRESETS = [
	{ description: 'Compact context window', label: '4000 chars', value: '4000' },
	{ description: 'Balanced default', label: '6000 chars', value: '6000' },
	{ description: 'Longer conversation history', label: '8000 chars', value: '8000' },
	{ description: 'Maximum preserved context', label: '12000 chars', value: '12000' }
] as const

export const COMPACT_TAIL_TURN_PRESETS = [
	{ description: 'Aggressive compaction with a small raw tail', label: '2 turns', value: '2' },
	{ description: 'Balanced default', label: '4 turns', value: '4' },
	{ description: 'Keep more recent turns verbatim', label: '8 turns', value: '8' }
] as const

export const COMPACT_AUTO_TURN_THRESHOLD_PRESETS = [
	{ description: 'Compact sooner based on turn count', label: '6 turns', value: '6' },
	{ description: 'Balanced default', label: '8 turns', value: '8' },
	{ description: 'Wait longer before auto compaction', label: '12 turns', value: '12' }
] as const

export const COMPACT_AUTO_PROMPT_CHAR_PRESETS = [
	{ description: 'Compact sooner as raw context grows', label: '2000 chars', value: '2000' },
	{ description: 'Balanced default', label: '4000 chars', value: '4000' },
	{ description: 'Allow a longer raw suffix', label: '6000 chars', value: '6000' }
] as const

export const TEMPERATURE_PRESETS = [
	{ label: 'Precise', sliderValue: 0, temperature: 0 },
	{ label: 'Focused', sliderValue: 1, temperature: 0.2 },
	{ label: 'Balanced', sliderValue: 2, temperature: 0.6 },
	{ label: 'Lively', sliderValue: 3, temperature: 0.9 },
	{ label: 'Creative', sliderValue: 4, temperature: 1.2 }
] as const
