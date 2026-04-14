import type { ResolvedAppConfig } from '../config'
import type { ToolExecutionContext } from '../tools/tool-types'
import { FireworksAdapter } from './fireworks-adapter'
import type { InferenceAdapter } from './types'

const ADAPTER_DESCRIPTORS = { fireworks: { id: 'fireworks', label: 'Fireworks AI' } } as const

export function createInferenceAdapter(
	provider: string,
	config: ResolvedAppConfig,
	toolContext: ToolExecutionContext = {}
): InferenceAdapter {
	switch (provider) {
		case 'fireworks':
			return new FireworksAdapter(config.providers.fireworks, config.configFile, toolContext.workspaceRoot, toolContext)
		default:
			throw new Error(`Unsupported inference provider "${provider}".`)
	}
}

export function getInferenceAdapterDescriptor(provider: string): { id: string; label: string } {
	return ADAPTER_DESCRIPTORS[provider as keyof typeof ADAPTER_DESCRIPTORS] ?? { id: provider, label: provider }
}
