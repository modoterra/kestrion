export function buildRuntimeSystemPrompt(
	baseSystemPrompt: string,
	now: Date = new Date(),
	timeZone: string = resolveSystemTimeZone()
): string {
	const normalizedBasePrompt = baseSystemPrompt.trim()
	const currentDate = new Intl.DateTimeFormat('en-CA', {
		day: '2-digit',
		month: '2-digit',
		timeZone,
		year: 'numeric'
	}).format(now)
	const currentTime = new Intl.DateTimeFormat('en-GB', {
		hour: '2-digit',
		hour12: false,
		minute: '2-digit',
		second: '2-digit',
		timeZone
	}).format(now)

	return `${normalizedBasePrompt}\n\nCURRENT DATE, TIME, AND TIME ZONE:\n- Current date: ${currentDate}\n- Current time: ${currentTime}\n- Current time zone: ${timeZone}\n- This is the authoritative current temporal context for this conversation.`
}

function resolveSystemTimeZone(): string {
	return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}
