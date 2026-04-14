export type FireworksContent = string | Array<{ text?: string; type?: string }>

export type FireworksToolCall = { function?: { arguments?: string; name?: string }; id?: string; type?: string }

export type FireworksRequestMessage =
	| { content: string; role: 'system' | 'user' }
	| { content: FireworksContent | null; role: 'assistant'; tool_calls?: FireworksToolCall[] }
	| { content: string; role: 'tool'; tool_call_id: string }

export type FireworksResponseMessage = {
	content?: FireworksContent | null
	role?: string
	tool_calls?: FireworksToolCall[]
}

export function extractFireworksMessageContent(
	message: Pick<FireworksResponseMessage, 'content'>,
	options?: { trim?: boolean }
): string {
	const content = message.content
	const trim = options?.trim ?? true

	if (typeof content === 'string') {
		return trim ? content.trim() : content
	}

	if (!Array.isArray(content)) {
		return ''
	}

	if (!trim) {
		return content.map(part => part.text ?? '').join('')
	}

	return content
		.map(part => part.text?.trim() ?? '')
		.filter(Boolean)
		.join('\n')
}
