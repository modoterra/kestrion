import { getErrorMessage, isRecord } from './common'
import type { ToolExecutionContext } from './tool-types'

const DEFAULT_MAX_CHARACTERS = 20_000

export const FETCH_TOOL_NAME = 'fetch'

export const FETCH_TOOL_DEFINITION = {
	function: {
		description: 'Fetch a URL over HTTP(S) and return text content.',
		name: FETCH_TOOL_NAME,
		parameters: {
			additionalProperties: false,
			properties: {
				maxCharacters: { description: 'Maximum number of characters to return.', minimum: 1, type: 'integer' },
				url: { description: 'Absolute HTTP(S) URL to fetch.', type: 'string' }
			},
			required: ['url'],
			type: 'object'
		},
		strict: true
	},
	type: 'function'
} as const

type FetchArguments = { maxCharacters?: number; url: string }
type FetchErrorResult = { error: string; ok: false; url?: string }
type FetchSuccessResult = {
	content: string
	contentType: string
	ok: true
	status: number
	truncated: boolean
	url: string
}

export type FetchResult = FetchErrorResult | FetchSuccessResult

export async function executeFetchTool(argumentsJson: string, _options: ToolExecutionContext = {}): Promise<string> {
	try {
		const parsedArguments = JSON.parse(argumentsJson) as unknown
		return JSON.stringify(await fetchUrl(parsedArguments))
	} catch (error) {
		return JSON.stringify({
			error: `Invalid fetch arguments: ${getErrorMessage(error)}`,
			ok: false
		} satisfies FetchErrorResult)
	}
}

export async function fetchUrl(input: unknown): Promise<FetchResult> {
	try {
		const argumentsValue = parseFetchArguments(input)
		const response = await fetch(argumentsValue.url)
		const contentType = response.headers.get('content-type') ?? 'unknown'
		const rawContent = await response.text()
		const maxCharacters = argumentsValue.maxCharacters ?? DEFAULT_MAX_CHARACTERS

		return {
			content: rawContent.slice(0, maxCharacters),
			contentType,
			ok: true,
			status: response.status,
			truncated: rawContent.length > maxCharacters,
			url: response.url || argumentsValue.url
		}
	} catch (error) {
		return { error: getErrorMessage(error), ok: false, url: getFetchUrl(input) }
	}
}

function getFetchUrl(input: unknown): string | undefined {
	if (!isRecord(input)) {
		return undefined
	}

	return typeof input.url === 'string' ? input.url : undefined
}

function parseFetchArguments(input: unknown): FetchArguments {
	if (!isRecord(input)) {
		throw new Error('Arguments must be a JSON object.')
	}

	const url = input.url
	if (typeof url !== 'string' || !url.trim()) {
		throw new Error('url must be a non-empty string.')
	}

	const parsedUrl = new URL(url)
	if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
		throw new Error('url must use http or https.')
	}

	const maxCharacters = input.maxCharacters
	if (
		maxCharacters !== undefined &&
		(typeof maxCharacters !== 'number' || !Number.isInteger(maxCharacters) || maxCharacters < 1)
	) {
		throw new Error('maxCharacters must be a positive integer when provided.')
	}

	return { maxCharacters, url: parsedUrl.toString() }
}
