import { AgentService } from '../lib/agent-service'
import { loadWritableAppConfig, saveAppConfig } from '../lib/config'
import { ConversationStore } from '../lib/conversation-store'
import { resolveAppPaths } from '../lib/paths'
import { runRememberTool } from '../lib/tools/remember'

export type MemorySeedEntry = { content: string; tags?: string[]; title?: string }
export type RenderAppMemory = { episodic?: MemorySeedEntry[]; longTerm?: MemorySeedEntry[]; scratch?: string }

export function createRenderAppContext(
	homeDir: string,
	options: { apiKeyConfigured?: boolean; memory?: RenderAppMemory; providerConfigured?: boolean }
): {
	config: ReturnType<typeof saveAppConfig>
	paths: ReturnType<typeof resolveAppPaths>
	service: AgentService
	store: ConversationStore
	writableConfig: ReturnType<typeof loadWritableAppConfig>
} {
	const paths = resolveAppPaths({ homeDir })
	const writableConfig = createWritableConfig(paths, options)
	const config = saveAppConfig(paths, writableConfig)
	const store = new ConversationStore(paths.databaseFile)
	const service = new AgentService(store, config)

	seedMemory(paths, options.memory)

	return { config, paths, service, store, writableConfig }
}

function createWritableConfig(
	paths: ReturnType<typeof resolveAppPaths>,
	options: { apiKeyConfigured?: boolean; providerConfigured?: boolean }
): ReturnType<typeof loadWritableAppConfig> {
	const writableConfig = loadWritableAppConfig(paths)
	writableConfig.providers.fireworks.providerMode = (options.providerConfigured ?? true) ? 'fireworks' : null

	if (options.apiKeyConfigured ?? true) {
		writableConfig.providers.fireworks.apiKey = 'test-api-key'
	}

	return writableConfig
}

function seedMemory(paths: ReturnType<typeof resolveAppPaths>, memory: RenderAppMemory | undefined): void {
	if (!memory) {
		return
	}

	if (memory.scratch !== undefined) {
		runRememberTool(
			{ action: 'write', content: memory.scratch, memory: 'scratch', mode: 'replace' },
			{ appPaths: paths }
		)
	}

	for (const entry of memory.episodic ?? []) {
		runRememberTool(
			{ action: 'write', content: entry.content, memory: 'episodic', tags: entry.tags, title: entry.title },
			{ appPaths: paths }
		)
	}

	for (const entry of memory.longTerm ?? []) {
		runRememberTool(
			{ action: 'write', content: entry.content, memory: 'long-term', tags: entry.tags, title: entry.title },
			{ appPaths: paths }
		)
	}
}
