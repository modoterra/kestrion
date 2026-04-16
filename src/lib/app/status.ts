import type { ResolvedAppConfig } from '../config'
import { getInferenceAdapterDescriptor } from '../inference/registry'

export function buildReadyStatus(config: ResolvedAppConfig): string {
	const fireworks = config.providers.fireworks
	if (fireworks.providerMode === null) {
		return 'Choose a provider.'
	}

	if (config.matrixPromptError) {
		return `Waiting for ${config.matrixPromptPath}.`
	}

	if (fireworks.apiKeySource === 'missing') {
		return `Waiting for ${fireworks.apiKeyEnv}.`
	}

	return `Ready on ${getInferenceAdapterDescriptor(config.defaultProvider).label}.`
}
