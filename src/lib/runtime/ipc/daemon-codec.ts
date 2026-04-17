import { type DaemonBootstrapResult } from '../daemon/controller'
import type { DaemonRequest, DaemonResponse } from '../daemon/protocol'
import {
	array,
	deserialize,
	discriminatedUnion,
	literal,
	number,
	object,
	optional,
	serialize,
	string,
	type Schema
} from './schema'
import {
	conversationCompactionResultSchema,
	conversationSummarySchema,
	conversationThreadSchema,
	daemonBootstrapResultSchema,
	mcpToolCallResultSchema,
	mcpToolListingSchema,
	memorySnapshotSchema,
	providerModelRecordSchema,
	resolvedAppConfigSchema,
	toolApprovalPromptSchema,
	toolApprovalResponseSchema,
	toolQuestionAnswerSchema,
	toolQuestionPromptSchema,
	workerTranscriptEntrySchema,
	workerTurnEventSchema
} from './shared-schemas'

const PROTOCOL = 'kestrion-daemon-v1'
const VERSION = 1

type DaemonRequestPayload =
	| { type: 'bootstrap' }
	| { content: string; conversationId: string; type: 'addUserMessage' }
	| { argumentsJson: string; toolName: string; type: 'callMcpTool' }
	| { conversationId: string; type: 'compactConversation' }
	| { conversationId: string; type: 'deleteConversation' }
	| { type: 'deleteAllConversations' }
	| { conversationId: string; type: 'generateAssistantReply' }
	| { conversationId: string; type: 'loadConversation' }
	| { conversationId: string; type: 'loadConversationWorkerTranscript' }
	| { limit?: number; type: 'listConversations' }
	| { type: 'listMcpTools' }
	| { providerId: string; type: 'listProviderModels' }
	| { type: 'loadMemorySnapshot' }
	| { config: import('../../config').ResolvedAppConfig; type: 'updateConfig' }
	| { requestId: string; type: 'cancelTurn' }
	| {
			approvalId: string
			decision: import('../../types').ToolApprovalResponse
			requestId: string
			type: 'toolAuthorizationDecision'
	  }
	| {
			answer: import('../../tools/tool-types').ToolQuestionAnswer
			promptId: string
			requestId: string
			type: 'questionResponse'
	  }

type DaemonSuccessResult =
	| { type: 'bootstrap'; value: DaemonBootstrapResult }
	| { type: 'conversationCompaction'; value: import('../../types').ConversationCompactionResult }
	| { type: 'conversationSummaries'; value: import('../../types').ConversationSummary[] }
	| { type: 'conversationThread'; value: import('../../types').ConversationThread }
	| { type: 'memorySnapshot'; value: import('../../storage/memory-store').MemorySnapshot }
	| { type: 'mcpToolCallResult'; value: import('../../mcp/types').McpToolCallResult }
	| { type: 'mcpToolListing'; value: import('../../mcp/types').McpToolListing }
	| { type: 'providerModels'; value: import('../../types').ProviderModelRecord[] }
	| { type: 'transcriptEntries'; value: import('../../types').WorkerTranscriptEntry[] }
	| { type: 'empty'; value: null }

type DaemonEnvelopePayload =
	| { request: DaemonRequestPayload; type: 'request' }
	| { error: string; type: 'responseError' }
	| { result: DaemonSuccessResult; type: 'responseOk' }
	| { event: import('../worker/types').WorkerTurnEvent; type: 'event' }
	| { entry: import('../../types').WorkerTranscriptEntry; type: 'transcriptEvent' }
	| { prompt: import('../../types').ToolApprovalPrompt; type: 'authorizationPrompt' }
	| { prompt: import('../../tools/tool-types').ToolQuestionPrompt; promptId: string; type: 'questionPrompt' }

type DaemonEnvelope = {
	messageId: string
	payload: DaemonEnvelopePayload
	protocol: typeof PROTOCOL
	version: typeof VERSION
}

const daemonRequestPayloadSchema: Schema<DaemonRequestPayload> = discriminatedUnion('type', {
	addUserMessage: object({ content: string(), conversationId: string(), type: literal('addUserMessage') }),
	bootstrap: object({ type: literal('bootstrap') }),
	cancelTurn: object({ requestId: string(), type: literal('cancelTurn') }),
	callMcpTool: object({ argumentsJson: string(), toolName: string(), type: literal('callMcpTool') }),
	compactConversation: object({ conversationId: string(), type: literal('compactConversation') }),
	deleteAllConversations: object({ type: literal('deleteAllConversations') }),
	deleteConversation: object({ conversationId: string(), type: literal('deleteConversation') }),
	generateAssistantReply: object({ conversationId: string(), type: literal('generateAssistantReply') }),
	listConversations: object({ limit: optional(number({ integer: true })), type: literal('listConversations') }),
	listMcpTools: object({ type: literal('listMcpTools') }),
	listProviderModels: object({ providerId: string(), type: literal('listProviderModels') }),
	loadConversation: object({ conversationId: string(), type: literal('loadConversation') }),
	loadConversationWorkerTranscript: object({
		conversationId: string(),
		type: literal('loadConversationWorkerTranscript')
	}),
	loadMemorySnapshot: object({ type: literal('loadMemorySnapshot') }),
	questionResponse: object({
		answer: toolQuestionAnswerSchema,
		promptId: string(),
		requestId: string(),
		type: literal('questionResponse')
	}),
	toolAuthorizationDecision: object({
		approvalId: string(),
		decision: toolApprovalResponseSchema,
		requestId: string(),
		type: literal('toolAuthorizationDecision')
	}),
	updateConfig: object({ config: resolvedAppConfigSchema, type: literal('updateConfig') })
})

const daemonSuccessResultSchema: Schema<DaemonSuccessResult> = discriminatedUnion('type', {
	bootstrap: object({ type: literal('bootstrap'), value: daemonBootstrapResultSchema }),
	conversationCompaction: object({ type: literal('conversationCompaction'), value: conversationCompactionResultSchema }),
	conversationSummaries: object({ type: literal('conversationSummaries'), value: array(conversationSummarySchema) }),
	conversationThread: object({ type: literal('conversationThread'), value: conversationThreadSchema }),
	empty: object({ type: literal('empty'), value: literal(null) }),
	memorySnapshot: object({ type: literal('memorySnapshot'), value: memorySnapshotSchema }),
	mcpToolCallResult: object({ type: literal('mcpToolCallResult'), value: mcpToolCallResultSchema }),
	mcpToolListing: object({ type: literal('mcpToolListing'), value: mcpToolListingSchema }),
	providerModels: object({ type: literal('providerModels'), value: array(providerModelRecordSchema) }),
	transcriptEntries: object({ type: literal('transcriptEntries'), value: array(workerTranscriptEntrySchema) })
})

const daemonEnvelopeSchema: Schema<DaemonEnvelope> = object({
	messageId: string(),
	payload: discriminatedUnion('type', {
		authorizationPrompt: object({ prompt: toolApprovalPromptSchema, type: literal('authorizationPrompt') }),
		event: object({ event: workerTurnEventSchema, type: literal('event') }),
		questionPrompt: object({ prompt: toolQuestionPromptSchema, promptId: string(), type: literal('questionPrompt') }),
		request: object({ request: daemonRequestPayloadSchema, type: literal('request') }),
		responseError: object({ error: string(), type: literal('responseError') }),
		responseOk: object({ result: daemonSuccessResultSchema, type: literal('responseOk') }),
		transcriptEvent: object({ entry: workerTranscriptEntrySchema, type: literal('transcriptEvent') })
	}),
	protocol: literal(PROTOCOL),
	version: literal(VERSION)
})

export type DaemonWireRequest = DaemonRequest
export type DaemonWireResponse = DaemonResponse

export function encodeDaemonRequest(message: DaemonWireRequest): Uint8Array {
	return serialize(daemonEnvelopeSchema, {
		messageId: message.id,
		payload: { request: stripRequestId(message), type: 'request' },
		protocol: PROTOCOL,
		version: VERSION
	})
}

export function decodeDaemonRequest(message: Uint8Array): DaemonWireRequest {
	const envelope = deserialize(daemonEnvelopeSchema, message)
	if (envelope.payload.type !== 'request') {
		throw new Error('Expected a daemon request envelope.')
	}

	return { ...envelope.payload.request, id: envelope.messageId }
}

export function encodeDaemonResponse(message: DaemonWireResponse): Uint8Array {
	return serialize(daemonEnvelopeSchema, {
		messageId: message.id,
		payload: toDaemonEnvelopePayload(message),
		protocol: PROTOCOL,
		version: VERSION
	})
}

export function decodeDaemonResponse(message: Uint8Array): DaemonWireResponse {
	const envelope = deserialize(daemonEnvelopeSchema, message)
	switch (envelope.payload.type) {
		case 'responseError':
			return { error: envelope.payload.error, id: envelope.messageId, ok: false, type: 'response' }
		case 'responseOk':
			return { id: envelope.messageId, ok: true, result: envelope.payload.result.value, type: 'response' }
		case 'event':
			return { event: envelope.payload.event, id: envelope.messageId, type: 'event' }
		case 'transcriptEvent':
			return { entry: envelope.payload.entry, id: envelope.messageId, type: 'transcriptEvent' }
		case 'authorizationPrompt':
			return { id: envelope.messageId, prompt: envelope.payload.prompt, type: 'authorizationPrompt' }
		case 'questionPrompt':
			return {
				id: envelope.messageId,
				prompt: envelope.payload.prompt,
				promptId: envelope.payload.promptId,
				type: 'questionPrompt'
			}
		case 'request':
			throw new Error('Expected a daemon response envelope.')
	}
}

function stripRequestId(message: DaemonRequest): DaemonRequestPayload {
	switch (message.type) {
		case 'bootstrap':
			return { type: 'bootstrap' }
		case 'addUserMessage':
			return { content: message.content, conversationId: message.conversationId, type: 'addUserMessage' }
		case 'callMcpTool':
			return { argumentsJson: message.argumentsJson, toolName: message.toolName, type: 'callMcpTool' }
		case 'compactConversation':
			return { conversationId: message.conversationId, type: 'compactConversation' }
		case 'deleteConversation':
			return { conversationId: message.conversationId, type: 'deleteConversation' }
		case 'deleteAllConversations':
			return { type: 'deleteAllConversations' }
		case 'generateAssistantReply':
			return { conversationId: message.conversationId, type: 'generateAssistantReply' }
		case 'loadConversation':
			return { conversationId: message.conversationId, type: 'loadConversation' }
		case 'loadConversationWorkerTranscript':
			return { conversationId: message.conversationId, type: 'loadConversationWorkerTranscript' }
		case 'listConversations':
			return { ...(message.limit !== undefined ? { limit: message.limit } : {}), type: 'listConversations' }
		case 'listMcpTools':
			return { type: 'listMcpTools' }
		case 'listProviderModels':
			return { providerId: message.providerId, type: 'listProviderModels' }
		case 'loadMemorySnapshot':
			return { type: 'loadMemorySnapshot' }
		case 'updateConfig':
			return { config: message.config, type: 'updateConfig' }
		case 'cancelTurn':
			return { requestId: message.requestId, type: 'cancelTurn' }
		case 'toolAuthorizationDecision':
			return {
				approvalId: message.approvalId,
				decision: message.decision,
				requestId: message.requestId,
				type: 'toolAuthorizationDecision'
			}
		case 'questionResponse':
			return {
				answer: message.answer,
				promptId: message.promptId,
				requestId: message.requestId,
				type: 'questionResponse'
			}
	}
}

function toDaemonEnvelopePayload(message: DaemonResponse): DaemonEnvelopePayload {
	if (message.type === 'response') {
		return message.ok
			? { result: classifyDaemonSuccessResult(message.result), type: 'responseOk' }
			: { error: message.error, type: 'responseError' }
	}
	if (message.type === 'event') {
		return { event: message.event, type: 'event' }
	}
	if (message.type === 'transcriptEvent') {
		return { entry: message.entry, type: 'transcriptEvent' }
	}
	if (message.type === 'authorizationPrompt') {
		return { prompt: message.prompt, type: 'authorizationPrompt' }
	}

	return { prompt: message.prompt, promptId: message.promptId, type: 'questionPrompt' }
}

function classifyDaemonSuccessResult(result: DaemonResponse extends infer _T ? unknown : never): DaemonSuccessResult {
	if (result === null) {
		return { type: 'empty', value: null }
	}
	if (isBootstrapResult(result)) {
		return { type: 'bootstrap', value: result }
	}
	if (isConversationCompactionResult(result)) {
		return { type: 'conversationCompaction', value: result }
	}
	if (isConversationThread(result)) {
		return { type: 'conversationThread', value: result }
	}
	if (isConversationSummaryList(result)) {
		return { type: 'conversationSummaries', value: result }
	}
	if (isMcpToolListing(result)) {
		return { type: 'mcpToolListing', value: result }
	}
	if (isMcpToolCallResult(result)) {
		return { type: 'mcpToolCallResult', value: result }
	}
	if (isProviderModelRecordList(result)) {
		return { type: 'providerModels', value: result }
	}
	if (isMemorySnapshot(result)) {
		return { type: 'memorySnapshot', value: result }
	}
	if (isWorkerTranscriptEntries(result)) {
		return { type: 'transcriptEntries', value: result }
	}

	throw new Error('Unsupported daemon response result payload.')
}

function isBootstrapResult(value: unknown): value is DaemonBootstrapResult {
	return isRecord(value) && 'writableConfig' in value && 'fireworksModels' in value && 'thread' in value
}

function isConversationThread(value: unknown): value is import('../../types').ConversationThread {
	return isRecord(value) && 'conversation' in value && 'messages' in value && 'toolCallMessages' in value
}

function isConversationCompactionResult(value: unknown): value is import('../../types').ConversationCompactionResult {
	return isRecord(value) && 'conversationId' in value && 'compacted' in value && 'reason' in value
}

function isConversationSummaryList(value: unknown): value is import('../../types').ConversationSummary[] {
	return (
		Array.isArray(value) &&
		(value.length === 0 || (isRecord(value[0]) && 'messageCount' in value[0] && 'preview' in value[0]))
	)
}

function isMcpToolCallResult(value: unknown): value is import('../../mcp/types').McpToolCallResult {
	return isRecord(value) && 'isError' in value && 'resultJson' in value
}

function isMcpToolListing(value: unknown): value is import('../../mcp/types').McpToolListing {
	return isRecord(value) && 'server' in value && 'tools' in value
}

function isProviderModelRecordList(value: unknown): value is import('../../types').ProviderModelRecord[] {
	return (
		Array.isArray(value) &&
		(value.length === 0 || (isRecord(value[0]) && 'providerId' in value[0] && 'sortOrder' in value[0]))
	)
}

function isMemorySnapshot(value: unknown): value is import('../../storage/memory-store').MemorySnapshot {
	return isRecord(value) && 'episodic' in value && 'longTerm' in value && 'scratch' in value
}

function isWorkerTranscriptEntries(value: unknown): value is import('../../types').WorkerTranscriptEntry[] {
	return (
		Array.isArray(value) &&
		(value.length === 0 || (isRecord(value[0]) && 'payloadJson' in value[0] && 'turnId' in value[0]))
	)
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}
