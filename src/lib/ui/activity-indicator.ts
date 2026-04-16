export type ActivityIndicatorVariant = 'accent' | 'muted' | 'provider' | 'summary'

const BRAILLE_MICRO_SPINNER_FRAMES = ['⠁', '⠂', '⠄', '⡀', '⢀', '⠠', '⠐', '⠈'] as const

const ACTIVITY_INDICATOR_PALETTES: Record<ActivityIndicatorVariant, readonly string[]> = {
	accent: ['#6470a3', '#7582ba', '#8794d0', '#99a7e6', '#aebcff', '#99a7e6', '#8794d0', '#7582ba'],
	muted: ['#60605b', '#72726d', '#85857f', '#999992', '#adada6', '#999992', '#85857f', '#72726d'],
	provider: ['#6a75a6', '#7c88bc', '#8d9ad2', '#a0ade8', '#b5c2ff', '#a0ade8', '#8d9ad2', '#7c88bc'],
	summary: ['#75633a', '#8b7442', '#a1864a', '#b99852', '#d8bf63', '#b99852', '#a1864a', '#8b7442']
}

export function getActivityIndicatorFrame(frameIndex: number): string {
	return BRAILLE_MICRO_SPINNER_FRAMES[normalizeFrameIndex(frameIndex)] ?? BRAILLE_MICRO_SPINNER_FRAMES[0]
}

export function getActivityIndicatorColor(frameIndex: number, variant: ActivityIndicatorVariant = 'accent'): string {
	const palette = ACTIVITY_INDICATOR_PALETTES[variant]
	return palette[normalizeFrameIndex(frameIndex)] ?? palette[0] ?? '#ffffff'
}

export function getActivityIndicatorFrameCount(): number {
	return BRAILLE_MICRO_SPINNER_FRAMES.length
}

function normalizeFrameIndex(frameIndex: number): number {
	return (
		((frameIndex % BRAILLE_MICRO_SPINNER_FRAMES.length) + BRAILLE_MICRO_SPINNER_FRAMES.length) %
		BRAILLE_MICRO_SPINNER_FRAMES.length
	)
}
