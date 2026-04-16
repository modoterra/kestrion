import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { loadWritableAppConfig, saveAppConfig } from '../lib/config'
import { resolveAppPaths } from '../lib/paths'
import { AgentService } from '../lib/services/agent-service'
import { ConversationStore } from '../lib/storage/conversation-store'
import { createTestingToolPolicy, type ToolPolicy } from '../lib/tools/policy'
import { runRememberTool } from '../lib/tools/remember'

export type MemorySeedEntry = { content: string; tags?: string[]; title?: string }
export type RenderAppMemory = { episodic?: MemorySeedEntry[]; longTerm?: MemorySeedEntry[]; scratch?: string }

export function createRenderAppContext(
	homeDir: string,
	options: {
		apiKeyConfigured?: boolean
		configureToolPolicy?: (policy: ToolPolicy) => ToolPolicy
		memory?: RenderAppMemory
		matrixConfigured?: boolean
		providerConfigured?: boolean
	}
): {
	agentService: AgentService
	config: ReturnType<typeof saveAppConfig>
	paths: ReturnType<typeof resolveAppPaths>
	store: ConversationStore
	writableConfig: ReturnType<typeof loadWritableAppConfig>
} {
	const paths = resolveAppPaths({ homeDir, runtimeDir: `${homeDir}/.runtime/kestrion` })
	const writableConfig = createWritableConfig(paths, options)
	const config = saveAppConfig(paths, writableConfig)
	const store = new ConversationStore(paths.databaseFile)
	const toolPolicy = options.configureToolPolicy
		? options.configureToolPolicy(createTestingToolPolicy())
		: createTestingToolPolicy()
	store.saveToolPolicy(toolPolicy)
	const agentService = new AgentService(store, config)

	seedMemory(paths, options.memory)

	return { agentService, config, paths, store, writableConfig }
}

function createWritableConfig(
	paths: ReturnType<typeof resolveAppPaths>,
	options: { apiKeyConfigured?: boolean; matrixConfigured?: boolean; providerConfigured?: boolean }
): ReturnType<typeof loadWritableAppConfig> {
	if (options.matrixConfigured ?? true) {
		writeMatrixPrompt(paths.configDir)
	}

	const writableConfig = loadWritableAppConfig(paths)
	writableConfig.providers.fireworks.providerMode = (options.providerConfigured ?? true) ? 'fireworks' : null

	if (options.apiKeyConfigured ?? true) {
		writableConfig.providers.fireworks.apiKey = 'test-api-key'
	}

	return writableConfig
}

function writeMatrixPrompt(configDir: string): void {
	writeFileSync(join(configDir, 'MATRIX.md'), '# Matrix\n\nFollow the shared Kestrion instructions.\n')
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
