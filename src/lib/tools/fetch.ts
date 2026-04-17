import { Buffer } from 'node:buffer'
import { lookup } from 'node:dns/promises'
import { request as requestHttp } from 'node:http'
import { request as requestHttps } from 'node:https'
import { isIP } from 'node:net'

import { getErrorMessage, isRecord } from './common'
import type { ToolExecutionContext, ToolFetchGatewayRequest, ToolFetchGatewayResponse } from './tool-types'

const DEFAULT_MAX_CHARACTERS = 20_000
const MAX_REDIRECTS = 5
const MAX_RESPONSE_BYTES = 1_048_576

export const FETCH_TOOL_NAME = 'fetch'

export const FETCH_TOOL_DEFINITION = {
	function: {
		description: 'Fetch a URL over HTTP(S) through the daemon gateway and return text content.',
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
	sizeBytes: number
	status: number
	truncated: boolean
	url: string
}
type GatewayResponse = { body: Buffer; headers: Record<string, string | undefined>; status: number; url: string }

export type FetchResult = FetchErrorResult | FetchSuccessResult

export async function executeFetchTool(argumentsJson: string, options: ToolExecutionContext = {}): Promise<string> {
	try {
		const parsedArguments = JSON.parse(argumentsJson) as unknown
		return JSON.stringify(await fetchUrl(parsedArguments, options))
	} catch (error) {
		return JSON.stringify({
			error: `Invalid fetch arguments: ${getErrorMessage(error)}`,
			ok: false
		} satisfies FetchErrorResult)
	}
}

export async function fetchUrl(input: unknown, options: ToolExecutionContext = {}): Promise<FetchResult> {
	try {
		const argumentsValue = parseFetchArguments(input)
		assertFetchHostnameAllowed(argumentsValue.url, options)
		const response = await fetchThroughGateway(new URL(argumentsValue.url), options)
		const contentType = response.headers['content-type'] ?? 'unknown'
		assertAllowedMimeType(contentType)
		const rawContent = response.body.toString('utf8')
		const maxCharacters = argumentsValue.maxCharacters ?? DEFAULT_MAX_CHARACTERS

		return {
			content: rawContent.slice(0, maxCharacters),
			contentType,
			ok: true,
			sizeBytes: response.body.byteLength,
			status: response.status,
			truncated: rawContent.length > maxCharacters,
			url: response.url
		}
	} catch (error) {
		return { error: getErrorMessage(error), ok: false, url: getFetchUrl(input) }
	}
}

async function fetchThroughGateway(initialUrl: URL, options: ToolExecutionContext): Promise<GatewayResponse> {
	let currentUrl = initialUrl

	for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
		const resolvedAddresses = await resolveGatewayAddresses(currentUrl.hostname, options)
		assertResolvedAddressesAllowed(resolvedAddresses)
		const response = await performGatewayRequest(currentUrl, resolvedAddresses[0]!, options)

		if (!isRedirectStatus(response.status)) {
			return response
		}

		if (redirectCount === MAX_REDIRECTS) {
			throw new Error(`Fetch redirect limit exceeded for ${initialUrl.toString()}.`)
		}

		const locationHeader = response.headers.location
		if (!locationHeader) {
			throw new Error(`Redirect response from ${currentUrl.toString()} was missing a location header.`)
		}

		currentUrl = new URL(locationHeader, currentUrl)
		assertFetchProtocol(currentUrl)
	}

	throw new Error(`Fetch redirect limit exceeded for ${initialUrl.toString()}.`)
}

async function resolveGatewayAddresses(
	hostname: string,
	options: ToolExecutionContext
): Promise<Array<{ address: string; family: 4 | 6 }>> {
	const resolved = options.fetchGatewayResolver
		? await options.fetchGatewayResolver(hostname)
		: ((await lookup(hostname, { all: true, verbatim: true })) as Array<{ address: string; family: number }>).filter(
				(entry): entry is { address: string; family: 4 | 6 } => entry.family === 4 || entry.family === 6
			)

	if (resolved.length === 0) {
		throw new Error(`Unable to resolve ${hostname}.`)
	}

	return resolved
}

async function performGatewayRequest(
	url: URL,
	resolvedAddress: { address: string; family: 4 | 6 },
	options: ToolExecutionContext
): Promise<GatewayResponse> {
	if (options.fetchGatewayRequester) {
		const response = await options.fetchGatewayRequester({ resolvedAddress, url })
		return normalizeGatewayResponse(response, url)
	}

	return new Promise<GatewayResponse>((resolve, reject) => {
		const requester = url.protocol === 'https:' ? requestHttps : requestHttp
		const request = requester(
			{
				headers: { accept: 'text/*, application/json', host: url.host, 'user-agent': 'kestrion-fetch-gateway/1.0' },
				hostname: resolvedAddress.address,
				lookup: (_hostname, _options, callback) => {
					callback(null, resolvedAddress.address, resolvedAddress.family)
				},
				method: 'GET',
				path: `${url.pathname}${url.search}`,
				port: url.port || undefined,
				protocol: url.protocol,
				servername: url.hostname
			},
			response => {
				const chunks: Buffer[] = []
				let sizeBytes = 0

				response.on('data', chunk => {
					const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
					sizeBytes += bufferChunk.byteLength
					if (sizeBytes > MAX_RESPONSE_BYTES) {
						request.destroy(new Error(`Fetch response exceeded ${MAX_RESPONSE_BYTES} bytes.`))
						return
					}
					chunks.push(bufferChunk)
				})
				response.on('end', () => {
					resolve({
						body: Buffer.concat(chunks),
						headers: normalizeHeaders(response.headers),
						status: response.statusCode ?? 0,
						url: url.toString()
					})
				})
				response.on('error', reject)
			}
		)

		request.on('error', reject)
		request.end()
	})
}

function normalizeGatewayResponse(response: ToolFetchGatewayResponse, url: URL): GatewayResponse {
	const body = typeof response.body === 'string' ? Buffer.from(response.body, 'utf8') : Buffer.from(response.body)
	if (body.byteLength > MAX_RESPONSE_BYTES) {
		throw new Error(`Fetch response exceeded ${MAX_RESPONSE_BYTES} bytes.`)
	}

	return {
		body,
		headers: normalizeHeaders(response.headers),
		status: response.status,
		url: response.url ?? url.toString()
	}
}

function normalizeHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string | undefined> {
	return Object.fromEntries(
		Object.entries(headers).map(([key, value]) => [key.toLowerCase(), Array.isArray(value) ? value.join(', ') : value])
	)
}

function assertFetchHostnameAllowed(url: string, options: ToolExecutionContext): void {
	const allowedDomains = options.networkAccessPolicy?.allowedDomains
	if (!allowedDomains || allowedDomains.length === 0) {
		return
	}

	const hostname = new URL(url).hostname.toLowerCase()
	if (!allowedDomains.includes(hostname)) {
		throw new Error(`Domain "${hostname}" is denied by policy for tool "fetch".`)
	}
}

function assertResolvedAddressesAllowed(addresses: Array<{ address: string; family: 4 | 6 }>): void {
	for (const entry of addresses) {
		if (isBlockedAddress(entry.address)) {
			throw new Error(`Resolved address "${entry.address}" is blocked for tool "fetch".`)
		}
	}
}

function assertAllowedMimeType(contentType: string): void {
	const normalized = contentType.toLowerCase().split(';')[0]?.trim() ?? ''
	if (normalized.startsWith('text/') || normalized === 'application/json') {
		return
	}

	throw new Error(`Fetch content type "${contentType}" is not allowed.`)
}

function isRedirectStatus(status: number): boolean {
	return status === 301 || status === 302 || status === 303 || status === 307 || status === 308
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
	assertFetchProtocol(parsedUrl)

	const maxCharacters = input.maxCharacters
	if (
		maxCharacters !== undefined &&
		(typeof maxCharacters !== 'number' || !Number.isInteger(maxCharacters) || maxCharacters < 1)
	) {
		throw new Error('maxCharacters must be a positive integer when provided.')
	}

	return { maxCharacters, url: parsedUrl.toString() }
}

function assertFetchProtocol(url: URL): void {
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new Error('url must use http or https.')
	}
}

function isBlockedAddress(address: string): boolean {
	const normalizedAddress = address.toLowerCase()
	if (normalizedAddress.startsWith('::ffff:')) {
		return isBlockedAddress(normalizedAddress.slice(7))
	}

	return isIPv4AddressBlocked(normalizedAddress) || isIPv6AddressBlocked(normalizedAddress)
}

function isIPv4AddressBlocked(address: string): boolean {
	if (isIP(address) !== 4) {
		return false
	}

	const numericAddress = toIPv4Integer(address)
	return (
		isWithinRange(numericAddress, '127.0.0.0', '127.255.255.255') ||
		isWithinRange(numericAddress, '10.0.0.0', '10.255.255.255') ||
		isWithinRange(numericAddress, '172.16.0.0', '172.31.255.255') ||
		isWithinRange(numericAddress, '192.168.0.0', '192.168.255.255') ||
		isWithinRange(numericAddress, '169.254.0.0', '169.254.255.255') ||
		numericAddress === toIPv4Integer('169.254.169.254') ||
		numericAddress === toIPv4Integer('169.254.170.2') ||
		isWithinRange(numericAddress, '100.64.0.0', '100.127.255.255')
	)
}

function isIPv6AddressBlocked(address: string): boolean {
	if (isIP(address) !== 6) {
		return false
	}

	const numericAddress = toIPv6BigInt(address)
	return numericAddress === toIPv6BigInt('::1') || (numericAddress & toIPv6BigInt('fe00::')) === toIPv6BigInt('fc00::')
}

function isWithinRange(address: number, start: string, end: string): boolean {
	return address >= toIPv4Integer(start) && address <= toIPv4Integer(end)
}

function toIPv4Integer(address: string): number {
	return (
		address
			.split('.')
			.map(part => Number.parseInt(part, 10))
			.reduce((result, part) => (result << 8) + part, 0) >>> 0
	)
}

function toIPv6BigInt(address: string): bigint {
	const expanded = expandIPv6Address(address)
	return expanded.split(':').reduce((result, part) => (result << 16n) + BigInt(Number.parseInt(part, 16)), 0n)
}

function expandIPv6Address(address: string): string {
	if (!address.includes('::')) {
		return address
	}

	const [head, tail] = address.split('::')
	const headParts = head ? head.split(':').filter(Boolean) : []
	const tailParts = tail ? tail.split(':').filter(Boolean) : []
	const missingParts = 8 - (headParts.length + tailParts.length)
	return [...headParts, ...Array.from({ length: missingParts }, () => '0'), ...tailParts].join(':')
}
