import type { ResolvedAppConfig, WritableAppConfig } from '../config'
import type { AppPaths } from '../paths'
import type { AppService } from '../services/app-service'
import type { ConversationSummary, ConversationThread, ProviderModelRecord } from '../types'

export type AppProps = {
	buildLabel: string
	config: ResolvedAppConfig
	fireworksModels: ProviderModelRecord[]
	initialConversations: ConversationSummary[]
	initialThread: ConversationThread
	initialWritableConfig: WritableAppConfig
	onExit?: () => void
	paths: AppPaths
	service: AppService
}
