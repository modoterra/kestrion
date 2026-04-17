import type { ResolvedAppConfig } from '../../config'
import type { McpToolCallResult, McpToolListing } from '../../mcp/types'
import type { MemorySnapshot } from '../../storage/memory-store'
import type { ToolQuestionAnswer, ToolQuestionPrompt } from '../../tools/tool-types'
import type {
	ConversationCompactionResult,
	ConversationSummary,
	ConversationThread,
	ProviderModelRecord,
	ToolApprovalPrompt,
	ToolApprovalResponse,
	WorkerTranscriptEntry
} from '../../types'
import type { WorkerTurnEvent } from '../worker/types'
import type { DaemonBootstrapResult } from './controller'

export type { DaemonBootstrapResult } from './controller'

export type DaemonRequest =
	| { id: string; type: 'bootstrap' }
	| { content: string; conversationId: string; id: string; type: 'addUserMessage' }
	| { argumentsJson: string; id: string; toolName: string; type: 'callMcpTool' }
	| { conversationId: string; id: string; type: 'compactConversation' }
	| { conversationId: string; id: string; type: 'deleteConversation' }
	| { id: string; type: 'deleteAllConversations' }
	| { conversationId: string; id: string; type: 'generateAssistantReply' }
	| { conversationId: string; id: string; type: 'loadConversation' }
	| { conversationId: string; id: string; type: 'loadConversationWorkerTranscript' }
	| { id: string; limit?: number; type: 'listConversations' }
	| { id: string; type: 'listMcpTools' }
	| { id: string; providerId: string; type: 'listProviderModels' }
	| { id: string; type: 'loadMemorySnapshot' }
	| { config: ResolvedAppConfig; id: string; type: 'updateConfig' }
	| { id: string; requestId: string; type: 'cancelTurn' }
	| {
			approvalId: string
			decision: ToolApprovalResponse
			id: string
			requestId: string
			type: 'toolAuthorizationDecision'
	  }
	| { answer: ToolQuestionAnswer; id: string; promptId: string; requestId: string; type: 'questionResponse' }

export type DaemonResponseResult =
	| DaemonBootstrapResult
	| ConversationCompactionResult
	| ConversationSummary[]
	| ConversationThread
	| McpToolCallResult
	| McpToolListing
	| MemorySnapshot
	| ProviderModelRecord[]
	| WorkerTranscriptEntry[]
	| null

export type DaemonResponse =
	| { error: string; id: string; ok: false; type: 'response' }
	| { id: string; ok: true; result: DaemonResponseResult; type: 'response' }
	| { id: string; prompt: ToolApprovalPrompt; type: 'authorizationPrompt' }
	| { id: string; prompt: ToolQuestionPrompt; promptId: string; type: 'questionPrompt' }
	| { event: WorkerTurnEvent; id: string; type: 'event' }
	| { entry: WorkerTranscriptEntry; id: string; type: 'transcriptEvent' }
