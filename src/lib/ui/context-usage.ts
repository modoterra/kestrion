const CONTEXT_USAGE_COLORS = ['#59d499', '#88d66a', '#d9c85f', '#e39b4f', '#dc6b61'] as const

export const EMPTY_CONTEXT_GLYPH_COLOR = '#50504a'

export function getContextUsageGlyphColor(progress: number): string {
	const normalized = Math.max(0, Math.min(1, progress))
	const colorIndex = Math.min(
		CONTEXT_USAGE_COLORS.length - 1,
		Math.round(normalized * (CONTEXT_USAGE_COLORS.length - 1))
	)
	return CONTEXT_USAGE_COLORS[colorIndex] ?? CONTEXT_USAGE_COLORS[0]
}

export function getContextUsageRatio(usedChars: number, limitChars: number): number {
	const normalizedLimit = Math.max(1, limitChars)
	return Math.max(0, Math.min(1, usedChars / normalizedLimit))
}
