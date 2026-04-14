import type { WritableAppConfig } from '../config'
import type { ProviderDraft } from './fields'

export function buildWritableConfig(currentConfig: WritableAppConfig, draft: ProviderDraft): WritableAppConfig {
	const apiKeyEnv = draft.apiKeyEnv.trim() || 'FIREWORKS_API_KEY'
	const baseUrl = draft.baseUrl.trim()
	const model = draft.model.trim()

	if (!baseUrl) {
		throw new Error('Base URL cannot be empty.')
	}

	if (!model) {
		throw new Error('Model cannot be empty.')
	}

	return {
		...currentConfig,
		providers: {
			...currentConfig.providers,
			fireworks: {
				apiKey: draft.apiKey.trim(),
				apiKeyEnv,
				baseUrl,
				maxTokens: parseIntegerField('Max tokens', draft.maxTokens, 1),
				model,
				promptTruncateLength: parseIntegerField('Prompt truncate length', draft.promptTruncateLength, 1),
				providerMode: draft.providerId ?? currentConfig.providers.fireworks.providerMode,
				temperature: parseNumberField('Temperature', draft.temperature, 0)
			}
		}
	}
}

export function toProviderDraft(config: WritableAppConfig): ProviderDraft {
	return {
		apiKey: config.providers.fireworks.apiKey,
		apiKeyEnv: config.providers.fireworks.apiKeyEnv,
		baseUrl: config.providers.fireworks.baseUrl,
		maxTokens: String(config.providers.fireworks.maxTokens),
		model: config.providers.fireworks.model,
		promptTruncateLength: String(config.providers.fireworks.promptTruncateLength),
		providerId: config.providers.fireworks.providerMode ?? undefined,
		temperature: String(config.providers.fireworks.temperature)
	}
}

function parseIntegerField(label: string, value: string, minimum: number): number {
	const parsed = Number.parseInt(value.trim(), 10)
	if (!Number.isFinite(parsed) || parsed < minimum) {
		throw new Error(`${label} must be an integer greater than or equal to ${minimum}.`)
	}

	return parsed
}

function parseNumberField(label: string, value: string, minimum: number): number {
	const parsed = Number.parseFloat(value.trim())
	if (!Number.isFinite(parsed) || parsed < minimum) {
		throw new Error(`${label} must be a number greater than or equal to ${minimum}.`)
	}

	return parsed
}
