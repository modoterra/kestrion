import type {
	FireworksProviderConfig,
	McpConfig,
	ResolvedAppConfig,
	WritableAppConfig,
	WritableFireworksProviderConfig,
	WritableMcpConfig
} from '../../config'
import type {
	IntegrityCapability,
	IntegrityFinding,
	IntegrityFindingScope,
	IntegrityStatus
} from '../../integrity/types'
import type { McpServerSnapshot, McpToolCallResult, McpToolListing, McpToolParameter, McpToolRecord } from '../../mcp/types'
import type { MemorySnapshot, StoredMemoryEntry } from '../../storage/memory-store'
import type { ToolAuthorizationContext } from '../../tools/policy'
import type {
	ToolFileAccessPolicy,
	ToolInvocationAuditRecord,
	ToolMemoryKind,
	ToolMutationRecord,
	ToolNetworkAccessPolicy,
	ToolQuestionAnswer,
	ToolQuestionOption,
	ToolQuestionPrompt
} from '../../tools/tool-types'
import type {
	ConversationCompactionRecord,
	ConversationCompactionResult,
	ConversationRecord,
	ConversationSummary,
	ConversationThread,
	InferenceToolCall,
	MessageRecord,
	ProviderModelRecord,
	ToolApprovalDecisionMode,
	ToolApprovalPrompt,
	ToolApprovalResponse,
	WorkerTranscriptDirection,
	WorkerTranscriptEntry,
	WorkerTranscriptKind
} from '../../types'
import type { DaemonBootstrapResult } from '../daemon/controller'
import type {
	WorkerExecutionEvent,
	WorkerExecutionTelemetry,
	WorkerSessionBootstrap,
	WorkerTurnEvent,
	WorkerToolExecutionRequest,
	WorkerToolExecutionResponse
} from '../worker/types'
import {
	array,
	boolean,
	discriminatedUnion,
	enumLike,
	jsonValue,
	literal,
	nullable,
	number,
	object,
	optional,
	recordOf,
	string,
	type Schema
} from './schema'

const apiKeySourceSchema: Schema<FireworksProviderConfig['apiKeySource']> = enumLike([
	'config',
	'env',
	'missing'
] as const)
const mcpPatSourceSchema: Schema<McpConfig['patSource']> = enumLike(['config', 'env', 'missing'] as const)
const providerModeSchema: Schema<WritableFireworksProviderConfig['providerMode']> = nullable(
	enumLike(['fireworks', 'custom'] as const)
)
const messageRoleSchema: Schema<MessageRecord['role']> = enumLike(['system', 'user', 'assistant'] as const)
const toolApprovalDecisionModeSchema: Schema<ToolApprovalDecisionMode> = enumLike([
	'allowForever',
	'allowOnce',
	'allowSession',
	'deny',
	'denyForever',
	'other'
] as const)
const workerTranscriptDirectionSchema: Schema<WorkerTranscriptDirection> = enumLike([
	'daemonToWorker',
	'workerToDaemon'
] as const)
const workerTranscriptKindSchema: Schema<WorkerTranscriptKind> = enumLike([
	'executionError',
	'executionEvent',
	'executeToolRequest',
	'executeToolResponse',
	'toolAuthorizationAllow',
	'toolAuthorizationDeny',
	'toolAuthorizationRequest',
	'hostToolError',
	'hostToolRequest',
	'hostToolResponse',
	'sessionBootstrap',
	'shutdown',
	'turnInput',
	'workerEvent'
] as const)
const toolMemoryKindSchema: Schema<ToolMemoryKind> = enumLike(['episodic', 'long-term', 'scratch'] as const)
const toolInvocationStatusSchema: Schema<ToolInvocationAuditRecord['status']> = enumLike([
	'denied',
	'error',
	'success'
] as const)
const integrityCapabilitySchema: Schema<IntegrityCapability> = enumLike([
	'audit',
	'memory',
	'persistentCapabilities',
	'skills'
] as const)
const integrityFindingScopeSchema: Schema<IntegrityFindingScope> = enumLike([
	'audit',
	'keys',
	'killSwitch',
	'memory',
	'skills'
] as const)

export const inferenceToolCallSchema: Schema<InferenceToolCall> = object({
	argumentsJson: string(),
	id: string(),
	name: string()
})

export const toolApprovalPromptSchema: Schema<ToolApprovalPrompt> = object({
	approvalId: string(),
	description: string(),
	requestedAccess: string(),
	toolArgumentsJson: string(),
	toolName: string()
})

export const toolApprovalResponseSchema: Schema<ToolApprovalResponse> = object({
	explanation: optional(string()),
	mode: toolApprovalDecisionModeSchema
})

export const toolQuestionOptionSchema: Schema<ToolQuestionOption> = object({
	description: optional(string()),
	label: string(),
	value: string()
})

export const toolQuestionPromptSchema: Schema<ToolQuestionPrompt> = object({
	allowFreeform: optional(boolean()),
	freeformOptionValue: optional(string()),
	options: optional(array(toolQuestionOptionSchema)),
	placeholder: optional(string()),
	prompt: string(),
	title: optional(string())
})

export const toolQuestionAnswerSchema: Schema<ToolQuestionAnswer> = discriminatedUnion('source', {
	cancelled: object({ answer: literal(''), cancelled: literal(true), source: literal('cancelled') }),
	freeform: object({
		answer: string(),
		cancelled: optional(literal(false)),
		optionLabel: optional(string()),
		optionValue: optional(string()),
		source: literal('freeform')
	}),
	option: object({
		answer: string(),
		cancelled: optional(literal(false)),
		optionLabel: optional(string()),
		optionValue: optional(string()),
		source: literal('option')
	})
})

export const toolFileAccessPolicySchema: Schema<ToolFileAccessPolicy> = object({
	defaultReadRoot: string(),
	readRoots: array(string()),
	writeRoots: array(string())
})

export const toolNetworkAccessPolicySchema: Schema<ToolNetworkAccessPolicy> = object({
	allowedDomains: array(string())
})

export const toolAuthorizationContextSchema: Schema<ToolAuthorizationContext> = object({
	allowedMemoryKinds: optional(array(toolMemoryKindSchema)),
	allowedSkillNames: optional(array(string())),
	fileAccessPolicy: optional(toolFileAccessPolicySchema),
	networkAccessPolicy: optional(toolNetworkAccessPolicySchema),
	todoAllowed: optional(boolean())
})

const toolResourceUsageSchema: Schema<NonNullable<ToolInvocationAuditRecord['resourceUsage']>> = object({
	maxResidentSetSizeBytes: optional(number({ integer: true })),
	systemCpuMs: optional(number({ integer: true })),
	userCpuMs: optional(number({ integer: true }))
})

export const toolInvocationAuditRecordSchema: Schema<ToolInvocationAuditRecord> = object({
	contentType: optional(string()),
	durationMs: number({ integer: true }),
	error: optional(string()),
	exitCode: optional(number({ integer: true })),
	finalUrl: optional(string()),
	outputSizeBytes: optional(number({ integer: true })),
	resourceUsage: optional(toolResourceUsageSchema),
	responseSizeBytes: optional(number({ integer: true })),
	responseStatus: optional(number({ integer: true })),
	sanitizedArguments: jsonValue(),
	status: toolInvocationStatusSchema,
	timedOut: optional(boolean()),
	toolName: string()
})

export const toolMutationRecordSchema: Schema<ToolMutationRecord> = object({
	operation: literal('write'),
	path: string(),
	sizeBytes: number({ integer: true }),
	toolName: string()
})

export const workerExecutionTelemetrySchema: Schema<WorkerExecutionTelemetry> = object({
	durationMs: optional(number({ integer: true })),
	exitCode: optional(number({ integer: true })),
	outputSizeBytes: optional(number({ integer: true })),
	resourceUsage: optional(toolResourceUsageSchema),
	timedOut: optional(boolean())
})

const fireworksProviderConfigSchema: Schema<FireworksProviderConfig> = object({
	apiKey: string(),
	apiKeyEnv: string(),
	apiKeySource: apiKeySourceSchema,
	baseUrl: string(),
	compactAutoPromptChars: number({ integer: true }),
	compactAutoTurnThreshold: number({ integer: true }),
	compactTailTurns: number({ integer: true }),
	maxTokens: number({ integer: true }),
	model: string(),
	promptTruncateLength: number({ integer: true }),
	providerMode: providerModeSchema,
	temperature: number()
})

const writableFireworksProviderConfigSchema: Schema<WritableFireworksProviderConfig> = object({
	apiKey: string(),
	apiKeyEnv: string(),
	baseUrl: string(),
	compactAutoPromptChars: number({ integer: true }),
	compactAutoTurnThreshold: number({ integer: true }),
	compactTailTurns: number({ integer: true }),
	maxTokens: number({ integer: true }),
	model: string(),
	promptTruncateLength: number({ integer: true }),
	providerMode: providerModeSchema,
	temperature: number()
})

const writableMcpConfigSchema: Schema<WritableMcpConfig> = object({
	enabled: boolean(),
	endpoint: string(),
	pat: string(),
	patEnv: string()
})

const mcpConfigSchema: Schema<McpConfig> = object({
	enabled: boolean(),
	endpoint: string(),
	pat: string(),
	patEnv: string(),
	patSource: mcpPatSourceSchema
})

export const writableAppConfigSchema: Schema<WritableAppConfig> = object({
	defaultProvider: literal('fireworks'),
	mcp: writableMcpConfigSchema,
	providers: object({ fireworks: writableFireworksProviderConfigSchema }),
	systemPrompt: string()
})

export const resolvedAppConfigSchema: Schema<ResolvedAppConfig> = object({
	configFile: string(),
	defaultProvider: string(),
	mcp: mcpConfigSchema,
	matrixPromptError: nullable(string()),
	matrixPromptPath: string(),
	providers: object({ fireworks: fireworksProviderConfigSchema }),
	systemPrompt: string()
})

const integrityFindingSchema: Schema<IntegrityFinding> = object({
	blockingCapabilities: array(integrityCapabilitySchema),
	message: string(),
	scope: integrityFindingScopeSchema
})

export const integrityStatusSchema: Schema<IntegrityStatus> = object({
	capabilities: object({
		auditTrusted: boolean(),
		memoryTrusted: boolean(),
		persistentCapabilitiesTrusted: boolean(),
		skillsTrusted: boolean()
	}),
	findings: array(integrityFindingSchema),
	killSwitchActive: boolean()
})

export const conversationRecordSchema: Schema<ConversationRecord> = object({
	createdAt: string(),
	id: string(),
	model: string(),
	provider: string(),
	title: string(),
	updatedAt: string()
})

export const conversationSummarySchema: Schema<ConversationSummary> = object({
	createdAt: string(),
	id: string(),
	messageCount: number({ integer: true }),
	model: string(),
	preview: nullable(string()),
	provider: string(),
	title: string(),
	updatedAt: string()
})

export const messageRecordSchema: Schema<MessageRecord> = object({
	content: string(),
	conversationId: string(),
	createdAt: string(),
	id: string(),
	model: nullable(string()),
	provider: nullable(string()),
	role: messageRoleSchema
})

const conversationCompactionRecordSchema: Schema<ConversationCompactionRecord> = object({
	compactedThroughMessageId: string(),
	conversationId: string(),
	summary: string(),
	updatedAt: string()
})

const toolCallMessageRecordSchema: Schema<ConversationThread['toolCallMessages'][number]> = object({
	conversationId: string(),
	createdAt: string(),
	id: string(),
	status: enumLike(['completed', 'running'] as const),
	toolCalls: array(inferenceToolCallSchema)
})

export const conversationThreadSchema: Schema<ConversationThread> = object({
	compaction: nullable(conversationCompactionRecordSchema),
	conversation: conversationRecordSchema,
	messages: array(messageRecordSchema),
	toolCallMessages: array(toolCallMessageRecordSchema)
})

const storedMemoryEntrySchema: Schema<StoredMemoryEntry> = object({
	content: string(),
	createdAt: string(),
	id: string(),
	tags: array(string()),
	title: string()
})

export const memorySnapshotSchema: Schema<MemorySnapshot> = object({
	episodic: array(storedMemoryEntrySchema),
	longTerm: array(storedMemoryEntrySchema),
	scratch: string()
})

export const providerModelRecordSchema: Schema<ProviderModelRecord> = object({
	description: string(),
	id: string(),
	label: string(),
	model: string(),
	providerId: string(),
	sortOrder: number({ integer: true })
})

const mcpToolParameterSchema: Schema<McpToolParameter> = object({
	description: string(),
	name: string(),
	required: boolean(),
	type: string()
})

const mcpToolRecordSchema: Schema<McpToolRecord> = object({
	description: string(),
	destructiveHint: boolean(),
	idempotentHint: boolean(),
	inputSchema: recordOf(jsonValue()),
	name: string(),
	openWorldHint: boolean(),
	parameters: array(mcpToolParameterSchema),
	readOnlyHint: boolean(),
	title: string()
})

const mcpServerSnapshotSchema: Schema<McpServerSnapshot> = object({
	endpoint: string(),
	instructions: nullable(string()),
	protocolVersion: string(),
	serverName: string(),
	serverTitle: string(),
	serverVersion: string()
})

export const mcpToolListingSchema: Schema<McpToolListing> = object({
	server: mcpServerSnapshotSchema,
	tools: array(mcpToolRecordSchema)
})

export const mcpToolCallResultSchema: Schema<McpToolCallResult> = object({
	isError: boolean(),
	resultJson: string()
})

export const workerTranscriptEntrySchema: Schema<WorkerTranscriptEntry> = object({
	conversationId: string(),
	createdAt: string(),
	direction: workerTranscriptDirectionSchema,
	id: string(),
	kind: workerTranscriptKindSchema,
	payloadJson: string(),
	sequence: number({ integer: true }),
	turnId: string()
})

export const conversationCompactionResultSchema: Schema<ConversationCompactionResult> = object({
	compacted: boolean(),
	conversationId: string(),
	reason: enumLike(['draft', 'no-op', 'updated'] as const)
})

export const daemonBootstrapResultSchema: Schema<DaemonBootstrapResult> = object({
	config: resolvedAppConfigSchema,
	conversations: array(conversationSummarySchema),
	fireworksModels: array(providerModelRecordSchema),
	integrity: integrityStatusSchema,
	thread: conversationThreadSchema,
	writableConfig: writableAppConfigSchema
})

export const workerTurnEventSchema: Schema<WorkerTurnEvent> = discriminatedUnion('type', {
	completed: object({ content: string(), model: string(), provider: string(), type: literal('completed') }),
	mutation: object({ mutation: toolMutationRecordSchema, type: literal('mutation') }),
	textDelta: object({ delta: string(), type: literal('textDelta') }),
	toolAudit: object({ audit: toolInvocationAuditRecordSchema, type: literal('toolAudit') }),
	toolCallsFinish: object({ toolCalls: array(inferenceToolCallSchema), type: literal('toolCallsFinish') }),
	toolCallsStart: object({ toolCalls: array(inferenceToolCallSchema), type: literal('toolCallsStart') })
})

export const workerSessionBootstrapSchema: Schema<WorkerSessionBootstrap> = object({
	conversationId: string(),
	filesystem: object({ defaultReadRoot: string(), readRoots: array(string()), writeRoots: array(string()) }),
	turnId: string()
})

export const workerToolExecutionRequestSchema: Schema<WorkerToolExecutionRequest> = object({
	argumentsJson: string(),
	authorization: toolAuthorizationContextSchema,
	requestId: string(),
	toolName: string()
})

export const workerToolExecutionResponseSchema: Schema<WorkerToolExecutionResponse> = object({
	audits: array(toolInvocationAuditRecordSchema),
	error: optional(string()),
	mutations: array(toolMutationRecordSchema),
	ok: boolean(),
	requestId: string(),
	result: optional(string()),
	telemetry: optional(workerExecutionTelemetrySchema)
})

export const workerExecutionEventSchema: Schema<WorkerExecutionEvent> = discriminatedUnion('type', {
	toolCompleted: object({
		payload: optional(recordOf(jsonValue())),
		requestId: string(),
		toolName: string(),
		type: literal('toolCompleted')
	}),
	toolStarted: object({
		payload: optional(recordOf(jsonValue())),
		requestId: string(),
		toolName: string(),
		type: literal('toolStarted')
	})
})

export const workerExecutionErrorSchema: Schema<{ error: string; requestId: string }> = object({
	error: string(),
	requestId: string()
})

export const workerShutdownSchema: Schema<{ reason?: string }> = object({ reason: optional(string()) })
