import { existsSync, readFileSync, writeFileSync } from 'node:fs'

import type { AppPaths } from './paths'

type ApiKeySource = 'config' | 'env' | 'missing'
type ProviderMode = 'fireworks' | 'custom'

type FireworksProviderConfigFile = {
	apiKey?: string
	apiKeyEnv?: string
	baseUrl?: string
	maxTokens?: number
	model?: string
	promptTruncateLength?: number
	providerMode?: ProviderMode
	temperature?: number
}

type AppConfigFile = {
	defaultProvider?: string
	providers?: { fireworks?: FireworksProviderConfigFile }
	systemPrompt?: string
}

export type WritableFireworksProviderConfig = {
	apiKey: string
	apiKeyEnv: string
	baseUrl: string
	maxTokens: number
	model: string
	promptTruncateLength: number
	providerMode: ProviderMode | null
	temperature: number
}

export type WritableAppConfig = {
	defaultProvider: 'fireworks'
	providers: { fireworks: WritableFireworksProviderConfig }
	systemPrompt: string
}

export type FireworksProviderConfig = {
	apiKey: string
	apiKeyEnv: string
	apiKeySource: ApiKeySource
	baseUrl: string
	maxTokens: number
	model: string
	promptTruncateLength: number
	providerMode: ProviderMode | null
	temperature: number
}

export type ResolvedAppConfig = {
	configFile: string
	defaultProvider: string
	providers: { fireworks: FireworksProviderConfig }
	systemPrompt: string
}

const DEFAULT_FIREWORKS_CONFIG: WritableFireworksProviderConfig = {
	apiKey: '',
	apiKeyEnv: 'FIREWORKS_API_KEY',
	baseUrl: 'https://api.fireworks.ai/inference/v1',
	maxTokens: 1024,
	model: 'accounts/fireworks/models/kimi-k2p5',
	promptTruncateLength: 6000,
	providerMode: null,
	temperature: 0.6
}

const DEFAULT_CONFIG: {
	defaultProvider: 'fireworks'
	providers: { fireworks: WritableFireworksProviderConfig }
	systemPrompt: string
} = {
	defaultProvider: 'fireworks',
	providers: { fireworks: DEFAULT_FIREWORKS_CONFIG },
	systemPrompt:
		'You are Kestrion, a terminal-first AI agent. Keep answers concise, useful, and easy to scan in a terminal.'
}

export function loadAppConfig(paths: AppPaths): ResolvedAppConfig {
	const rawConfig = loadWritableAppConfig(paths)
	return resolveAppConfig(paths.configFile, rawConfig)
}

export function loadWritableAppConfig(paths: AppPaths): WritableAppConfig {
	return readOrCreateConfig(paths)
}

export function saveAppConfig(paths: AppPaths, config: WritableAppConfig): ResolvedAppConfig {
	writeFileSync(paths.configFile, JSON.stringify(config, null, 2))
	return resolveAppConfig(paths.configFile, config)
}

export function getDefaultAppConfig(): WritableAppConfig {
	return {
		defaultProvider: DEFAULT_CONFIG.defaultProvider,
		providers: { fireworks: { ...DEFAULT_FIREWORKS_CONFIG } },
		systemPrompt: DEFAULT_CONFIG.systemPrompt
	}
}

function resolveAppConfig(configFile: string, rawConfig: WritableAppConfig): ResolvedAppConfig {
	const fileConfig = rawConfig.providers?.fireworks ?? {}
	const defaultProvider =
		rawConfig.defaultProvider === 'fireworks' ? rawConfig.defaultProvider : DEFAULT_CONFIG.defaultProvider
	const apiKeyEnv = fileConfig.apiKeyEnv ?? DEFAULT_FIREWORKS_CONFIG.apiKeyEnv
	const envApiKey = process.env[apiKeyEnv]?.trim() ?? ''
	const fileApiKey = fileConfig.apiKey?.trim() ?? ''
	const apiKey = envApiKey || fileApiKey
	const apiKeySource: ApiKeySource = envApiKey ? 'env' : fileApiKey ? 'config' : 'missing'

	return {
		configFile,
		defaultProvider,
		providers: {
			fireworks: {
				apiKey,
				apiKeyEnv,
				apiKeySource,
				baseUrl: fileConfig.baseUrl ?? DEFAULT_FIREWORKS_CONFIG.baseUrl,
				maxTokens: fileConfig.maxTokens ?? DEFAULT_FIREWORKS_CONFIG.maxTokens,
				model: fileConfig.model ?? DEFAULT_FIREWORKS_CONFIG.model,
				promptTruncateLength: fileConfig.promptTruncateLength ?? DEFAULT_FIREWORKS_CONFIG.promptTruncateLength,
				providerMode: inferProviderMode(fileConfig),
				temperature: fileConfig.temperature ?? DEFAULT_FIREWORKS_CONFIG.temperature
			}
		},
		systemPrompt: rawConfig.systemPrompt ?? DEFAULT_CONFIG.systemPrompt
	}
}

function readOrCreateConfig(paths: AppPaths): WritableAppConfig {
	if (!existsSync(paths.configFile)) {
		const defaultConfig = getDefaultAppConfig()
		writeFileSync(paths.configFile, JSON.stringify(defaultConfig, null, 2))
		return defaultConfig
	}

	const content = readFileSync(paths.configFile, 'utf8')
	if (!content.trim()) {
		const defaultConfig = getDefaultAppConfig()
		writeFileSync(paths.configFile, JSON.stringify(defaultConfig, null, 2))
		return defaultConfig
	}

	const parsed = JSON.parse(content) as AppConfigFile

	return {
		defaultProvider: parsed.defaultProvider === 'fireworks' ? parsed.defaultProvider : DEFAULT_CONFIG.defaultProvider,
		providers: {
			fireworks: {
				apiKey: parsed.providers?.fireworks?.apiKey ?? DEFAULT_FIREWORKS_CONFIG.apiKey,
				apiKeyEnv: parsed.providers?.fireworks?.apiKeyEnv ?? DEFAULT_FIREWORKS_CONFIG.apiKeyEnv,
				baseUrl: parsed.providers?.fireworks?.baseUrl ?? DEFAULT_FIREWORKS_CONFIG.baseUrl,
				maxTokens: parsed.providers?.fireworks?.maxTokens ?? DEFAULT_FIREWORKS_CONFIG.maxTokens,
				model: parsed.providers?.fireworks?.model ?? DEFAULT_FIREWORKS_CONFIG.model,
				promptTruncateLength:
					parsed.providers?.fireworks?.promptTruncateLength ?? DEFAULT_FIREWORKS_CONFIG.promptTruncateLength,
				providerMode: inferProviderMode(parsed.providers?.fireworks),
				temperature: parsed.providers?.fireworks?.temperature ?? DEFAULT_FIREWORKS_CONFIG.temperature
			}
		},
		systemPrompt: parsed.systemPrompt ?? DEFAULT_CONFIG.systemPrompt
	}
}

function inferProviderMode(
	fileConfig:
		| Pick<WritableFireworksProviderConfig, 'baseUrl' | 'providerMode'>
		| FireworksProviderConfigFile
		| undefined
): ProviderMode | null {
	if (fileConfig?.providerMode === 'fireworks' || fileConfig?.providerMode === 'custom') {
		return fileConfig.providerMode
	}

	const baseUrl = fileConfig?.baseUrl?.trim()
	if (baseUrl && baseUrl !== DEFAULT_FIREWORKS_CONFIG.baseUrl) {
		return 'custom'
	}

	return null
}
