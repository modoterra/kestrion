import type { TextareaRenderable } from '@opentui/core'
import { startTransition, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'

import type { AgentService } from '../agent-service'
import { toErrorMessage } from '../errors'
import type { ToolExecutionContext } from '../tools/tool-types'
import type { ConversationSummary, ConversationThread, InferenceToolCall, MessageRecord } from '../types'

type SetConversations = Dispatch<SetStateAction<ConversationSummary[]>>
type SetThread = Dispatch<SetStateAction<ConversationThread>>

type SendPromptActionArgs = {
	activeThreadId: string
	applyThread: (thread: ConversationThread, nextStatus: string) => void
	busy: boolean
	composer: string
	composerRef: MutableRefObject<TextareaRenderable | null>
	inFlightRequest: MutableRefObject<AbortController | null>
	missingProvider: boolean
	providerLabel: string
	resetComposer: (nextValue?: string) => void
	service: AgentService
	setActiveThread: SetThread
	setActiveToolCalls: Dispatch<SetStateAction<InferenceToolCall[] | null>>
	setBusy: Dispatch<SetStateAction<boolean>>
	setConversations: SetConversations
	setError: Dispatch<SetStateAction<string | null>>
	setPendingAssistantMessage: Dispatch<SetStateAction<MessageRecord | null>>
	setStatus: Dispatch<SetStateAction<string>>
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
	const withUserMessage = createUserThread(args, prompt)
	const conversationId = withUserMessage.conversation.id
	args.applyThread(withUserMessage, `${args.providerLabel} is thinking...`)

	try {
		const withAssistantMessage = await args.service.generateAssistantReply(
			conversationId,
			controller.signal,
			createInferenceEvents(args, withUserMessage),
			args.toolContext
		)
		args.setActiveToolCalls(null)
		args.setPendingAssistantMessage(null)
		args.applyThread(withAssistantMessage, `${args.providerLabel} replied.`)
	} catch (cause) {
		handlePromptFailure(
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

function createUserThread(args: SendPromptActionArgs, prompt: string): ConversationThread {
	return args.service.addUserMessage(args.activeThreadId, prompt)
}

function createInferenceEvents(
	args: SendPromptActionArgs,
	thread: ConversationThread
): {
	onTextDelta: (delta: string) => void
	onToolCallsFinish: () => void
	onToolCallsStart: (toolCalls: InferenceToolCall[]) => void
} {
	return {
		onTextDelta: delta => {
			appendPendingAssistantDelta(delta, args.setPendingAssistantMessage, thread)
			args.setStatus(`${args.providerLabel} is replying...`)
		},
		onToolCallsFinish: () => {
			args.setActiveToolCalls(null)
			args.setStatus(`${args.providerLabel} is thinking...`)
		},
		onToolCallsStart: toolCalls => {
			args.setActiveToolCalls(toolCalls)
			args.setStatus(buildToolCallStatus(args.providerLabel, toolCalls))
		}
	}
}

function resolveSubmittedPrompt(args: SendPromptActionArgs, submittedValue: string | undefined): string | null {
	if (args.busy || args.missingProvider || args.viewStackIsActive) {
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

function handlePromptFailure(
	cause: unknown,
	conversationId: string,
	service: AgentService,
	setActiveThread: SetThread,
	setActiveToolCalls: Dispatch<SetStateAction<InferenceToolCall[] | null>>,
	setConversations: SetConversations,
	setError: Dispatch<SetStateAction<string | null>>,
	setPendingAssistantMessage: Dispatch<SetStateAction<MessageRecord | null>>,
	setStatus: Dispatch<SetStateAction<string>>
): void {
	const latestThread = service.loadConversation(conversationId)
	startTransition(() => {
		setActiveThread(latestThread)
		setActiveToolCalls(null)
		setConversations(service.listConversations())
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
