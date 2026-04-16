import { getContextUsageRatio } from './context-usage'

export function formatCompactCount(value: number): string {
	if (value >= 1000) {
		const compact = value % 1000 === 0 ? String(value / 1000) : (value / 1000).toFixed(1).replace(/\.0$/, '')
		return `${compact}k`
	}

	return String(value)
}

export function formatUsagePercent(usedChars: number, limitChars: number): string {
	const percent = Math.max(0, Math.min(999, Math.round(getContextUsageRatio(usedChars, limitChars) * 100)))
	return `${percent}%`
}
