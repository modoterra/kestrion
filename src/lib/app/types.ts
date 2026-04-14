import type { AgentService } from '../agent-service'
import type { ResolvedAppConfig, WritableAppConfig } from '../config'
import type { AppPaths } from '../paths'
import type { ConversationSummary, ConversationThread } from '../types'

export type AppProps = {
	buildLabel: string
	config: ResolvedAppConfig
	initialConversations: ConversationSummary[]
	initialThread: ConversationThread
	initialWritableConfig: WritableAppConfig
	onExit?: () => void
	paths: AppPaths
	service: AgentService
}
