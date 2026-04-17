import { createHash } from 'node:crypto'

export function stableStringify(value: unknown): string {
	if (value === null || typeof value !== 'object') {
		return JSON.stringify(value)
	}

	if (Array.isArray(value)) {
		return `[${value.map(entry => stableStringify(entry)).join(',')}]`
	}

	const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
	return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(',')}}`
}

export function sha256Hex(value: string | Uint8Array): string {
	return createHash('sha256').update(value).digest('hex')
}

export function addDays(timestampIso: string, days: number): string {
	const date = new Date(timestampIso)
	date.setUTCDate(date.getUTCDate() + days)
	return date.toISOString()
}

export function isTimestampExpired(timestampIso: string, nowIso: string): boolean {
	if (!timestampIso.trim()) {
		return true
	}

	return timestampIso <= nowIso
}
