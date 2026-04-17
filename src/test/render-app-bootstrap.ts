import { DaemonController } from '../lib/runtime/daemon/controller'
import { SubprocessTurnRunner } from '../lib/runtime/worker/subprocess-turn-runner'
import { ControllerAppService } from '../lib/services/controller-app-service'
import type { ToolPolicy } from '../lib/tools/policy'
import { createRenderAppContext, type RenderAppMemory } from './render-app-context'

export type { RenderAppMemory } from './render-app-context'

export function createRenderAppBootstrap(
	homeDir: string,
	options: {
		apiKeyConfigured?: boolean
		configureToolPolicy?: (policy: ToolPolicy) => ToolPolicy
		memory?: RenderAppMemory
		mcpConfigured?: boolean
		mcpEndpoint?: string
		matrixConfigured?: boolean
		providerConfigured?: boolean
	}
): {
	agentService: ReturnType<typeof createRenderAppContext>['agentService']
	appService: ControllerAppService
	config: ReturnType<typeof createRenderAppContext>['config']
	controller: DaemonController
	paths: ReturnType<typeof createRenderAppContext>['paths']
	store: ReturnType<typeof createRenderAppContext>['store']
	writableConfig: ReturnType<typeof createRenderAppContext>['writableConfig']
} {
	const { agentService, config, paths, store, writableConfig } = createRenderAppContext(homeDir, options)
	const controller = new DaemonController(store, agentService, paths, new SubprocessTurnRunner(), config)

	return {
		agentService,
		appService: new ControllerAppService(controller, agentService),
		config,
		controller,
		paths,
		store,
		writableConfig
	}
}
