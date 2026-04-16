import type { TextareaRenderable } from '@opentui/core'
import { startTransition, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'

import { toErrorMessage } from '../errors'
import type { AppService } from '../services/app-service'
import type { ToolExecutionContext } from '../tools/tool-types'
import type {
	ConversationSummary,
	ConversationThread,
	InferenceEvents,
	InferenceToolCall,
	MessageRecord,
	ToolApprovalPrompt,
	ToolApprovalResponse,
	ToolCallMessageRecord,
	WorkerTranscriptEntry
} from '../types'

type SetConversations = Dispatch<SetStateAction<ConversationSummary[]>>
type SetThread = Dispatch<SetStateAction<ConversationThread>>

type SendPromptActionArgs = {
	activeThreadId: string
	applyThread: (thread: ConversationThread, conversations: ConversationSummary[], nextStatus: string) => void
	busy: boolean
	composer: string
	composerRef: MutableRefObject<TextareaRenderable | null>
	inFlightRequest: MutableRefObject<AbortController | null>
	missingSetup: boolean
	providerLabel: string
	resetComposer: (nextValue?: string) => void
	service: AppService
	mergeWorkerTranscriptEntriesForConversation: (conversationId: string, entries: WorkerTranscriptEntry[]) => void
	requestApproval: (prompt: ToolApprovalPrompt) => Promise<ToolApprovalResponse>
	setActiveThread: SetThread
	setActiveToolCalls: Dispatch<SetStateAction<InferenceToolCall[] | null>>
	setBusy: Dispatch<SetStateAction<boolean>>
	setConversations: SetConversations
	setError: Dispatch<SetStateAction<string | null>>
	setPendingAssistantMessage: Dispatch<SetStateAction<MessageRecord | null>>
	setStatus: Dispatch<SetStateAction<string>>
	setToolCallMessages: Dispatch<SetStateAction<ToolCallMessageRecord[]>>
	toolContext: ToolExecutionContext
	viewStackIsActive: boolean
}

export function useSendPromptAction(args: SendPromptActionArgs): (submittedValue?: string) => Promise<void> {
	return async function sendPrompt(submittedValue?: string): Promise<void> {
		await sendPromptRequest(args, submittedValue)
	}
}

async function sendPromptRequest(args: SendPromptActionArgs, submittedValue: string | undefined): Promise<void> {
	const prompt = resolveSubmittedPrompt(args, submittedValue)
	if (!prompt) {
		return
	}

	const controller = startPromptRequest(args)
	const withUserMessage = await createUserThread(args, prompt)
	const conversationId = withUserMessage.conversation.id
	args.applyThread(withUserMessage, await args.service.listConversations(), `${args.providerLabel} is thinking...`)

	try {
		const withAssistantMessage = await args.service.generateAssistantReply(
			conversationId,
			controller.signal,
			createInferenceEvents(args, withUserMessage),
			args.toolContext
		)
		args.setActiveToolCalls(null)
		args.setPendingAssistantMessage(null)
		args.applyThread(withAssistantMessage, await args.service.listConversations(), `${args.providerLabel} replied.`)
	} catch (cause) {
		await handlePromptFailure(
			cause,
			conversationId,
			args.service,
			args.setActiveThread,
			args.setActiveToolCalls,
			args.setConversations,
			args.setError,
			args.setPendingAssistantMessage,
			args.setStatus
		)
	} finally {
		args.inFlightRequest.current = null
		args.setBusy(false)
	}
}

function startPromptRequest(args: SendPromptActionArgs): AbortController {
	const controller = new AbortController()
	args.inFlightRequest.current = controller
	args.setBusy(true)
	args.resetComposer()
	args.setActiveToolCalls(null)
	args.setError(null)
	args.setPendingAssistantMessage(null)
	return controller
}

function createUserThread(args: SendPromptActionArgs, prompt: string): Promise<ConversationThread> {
	return args.service.addUserMessage(args.activeThreadId, prompt)
}

function createInferenceEvents(args: SendPromptActionArgs, thread: ConversationThread): InferenceEvents {
	return {
		onTextDelta: delta => {
			appendPendingAssistantDelta(delta, args.setPendingAssistantMessage, thread)
			args.setStatus(`${args.providerLabel} is replying...`)
		},
		onToolCallsFinish: () => {
			args.setActiveToolCalls(null)
			args.setToolCallMessages(current => markLatestToolCallBatchCompleted(current))
			args.setStatus(`${args.providerLabel} is thinking...`)
		},
		onToolCallsStart: toolCalls => {
			args.setActiveToolCalls(toolCalls)
			args.setToolCallMessages(current => current.concat(createToolCallMessage(thread.conversation.id, toolCalls)))
			args.setStatus(buildToolCallStatus(args.providerLabel, toolCalls))
		},
		onToolApprovalPrompt: prompt => args.requestApproval(prompt),
		onWorkerTranscriptEntry: entry => {
			args.mergeWorkerTranscriptEntriesForConversation(thread.conversation.id, [entry])
		}
	}
}

function resolveSubmittedPrompt(args: SendPromptActionArgs, submittedValue: string | undefined): string | null {
	if (args.busy || args.missingSetup || args.viewStackIsActive) {
		return null
	}

	return getFirstPromptValue(submittedValue, args.composerRef.current?.plainText, args.composer)
}

function getFirstPromptValue(...values: unknown[]): string | null {
	for (const value of values) {
		if (typeof value !== 'string') {
			continue
		}

		const prompt = value.trim()
		if (prompt) {
			return prompt
		}
	}

	return null
}

async function handlePromptFailure(
	cause: unknown,
	conversationId: string,
	service: AppService,
	setActiveThread: SetThread,
	setActiveToolCalls: Dispatch<SetStateAction<InferenceToolCall[] | null>>,
	setConversations: SetConversations,
	setError: Dispatch<SetStateAction<string | null>>,
	setPendingAssistantMessage: Dispatch<SetStateAction<MessageRecord | null>>,
	setStatus: Dispatch<SetStateAction<string>>
): Promise<void> {
	const latestThread = await service.loadConversation(conversationId)
	const conversations = await service.listConversations()
	startTransition(() => {
		setActiveThread(latestThread)
		setActiveToolCalls(null)
		setConversations(conversations)
		setPendingAssistantMessage(null)
		setStatus('Request failed.')
		setError(toErrorMessage(cause))
	})
}

function appendPendingAssistantDelta(
	delta: string,
	setPendingAssistantMessage: Dispatch<SetStateAction<MessageRecord | null>>,
	thread: ConversationThread
): void {
	if (!delta) {
		return
	}

	setPendingAssistantMessage(current =>
		current
			? { ...current, content: `${current.content}${delta}` }
			: {
					content: delta,
					conversationId: thread.conversation.id,
					createdAt: new Date().toISOString(),
					id: `stream:${thread.conversation.id}`,
					model: thread.conversation.model,
					provider: thread.conversation.provider,
					role: 'assistant'
				}
	)
}

function buildToolCallStatus(providerLabel: string, toolCalls: InferenceToolCall[]): string {
	const toolNames = toolCalls.map(toolCall => toolCall.name).filter(Boolean)
	const toolSummary =
		toolNames.length <= 2 ? toolNames.join(', ') : `${toolNames.slice(0, 2).join(', ')} +${toolNames.length - 2}`

	return toolSummary ? `${providerLabel} is using ${toolSummary}...` : `${providerLabel} is using tools...`
}

function createToolCallMessage(conversationId: string, toolCalls: InferenceToolCall[]): ToolCallMessageRecord {
	return {
		conversationId,
		createdAt: new Date().toISOString(),
		id: `tool:${conversationId}:${Date.now()}:${buildToolCallBatchKey(toolCalls)}`,
		status: 'running',
		toolCalls
	}
}

function markLatestToolCallBatchCompleted(messages: ToolCallMessageRecord[]): ToolCallMessageRecord[] {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index]
		if (message?.status !== 'running') {
			continue
		}

		return messages.map((entry, entryIndex) => (entryIndex === index ? { ...entry, status: 'completed' } : entry))
	}

	return messages
}

function buildToolCallBatchKey(toolCalls: InferenceToolCall[]): string {
	return toolCalls.map(toolCall => toolCall.id || `${toolCall.name}:${toolCall.argumentsJson}`).join('|')
}
