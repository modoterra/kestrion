import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

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
	matrixPromptError: string | null
	matrixPromptPath: string
	providers: { fireworks: FireworksProviderConfig }
	systemPrompt: string
}

type ResolvedMatrixPrompt = { error: string | null; path: string; systemPrompt: string }

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
	systemPrompt: 'You are Kestrion, a terminal-first AI agent.'
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
	return resolveAppConfigFromWritableConfig(configFile, rawConfig)
}

export function resolveRuntimeAppConfig(config: ResolvedAppConfig): ResolvedAppConfig {
	return {
		...config,
		providers: { ...config.providers, fireworks: resolveFireworksConfigWithEnv(config.providers.fireworks) }
	}
}

export function assertMatrixPromptConfigured(config: ResolvedAppConfig): void {
	if (!config.matrixPromptError) {
		return
	}

	throw new Error(config.matrixPromptError)
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

function resolveAppConfigFromWritableConfig(configFile: string, rawConfig: WritableAppConfig): ResolvedAppConfig {
	const fileConfig = rawConfig.providers?.fireworks ?? {}
	const defaultProvider =
		rawConfig.defaultProvider === 'fireworks' ? rawConfig.defaultProvider : DEFAULT_CONFIG.defaultProvider
	const resolvedMatrixPrompt = resolveMatrixPrompt(configFile, rawConfig.systemPrompt ?? DEFAULT_CONFIG.systemPrompt)

	return {
		configFile,
		defaultProvider,
		matrixPromptError: resolvedMatrixPrompt.error,
		matrixPromptPath: resolvedMatrixPrompt.path,
		providers: {
			fireworks: resolveFireworksConfigWithEnv({
				apiKey: fileConfig.apiKey?.trim() ?? '',
				apiKeyEnv: fileConfig.apiKeyEnv ?? DEFAULT_FIREWORKS_CONFIG.apiKeyEnv,
				apiKeySource: 'missing',
				baseUrl: fileConfig.baseUrl ?? DEFAULT_FIREWORKS_CONFIG.baseUrl,
				maxTokens: fileConfig.maxTokens ?? DEFAULT_FIREWORKS_CONFIG.maxTokens,
				model: fileConfig.model ?? DEFAULT_FIREWORKS_CONFIG.model,
				promptTruncateLength: fileConfig.promptTruncateLength ?? DEFAULT_FIREWORKS_CONFIG.promptTruncateLength,
				providerMode: inferProviderMode(fileConfig),
				temperature: fileConfig.temperature ?? DEFAULT_FIREWORKS_CONFIG.temperature
			})
		},
		systemPrompt: resolvedMatrixPrompt.systemPrompt
	}
}

function resolveFireworksConfigWithEnv(config: FireworksProviderConfig): FireworksProviderConfig {
	const apiKeyEnv = config.apiKeyEnv || DEFAULT_FIREWORKS_CONFIG.apiKeyEnv
	const envApiKey = process.env[apiKeyEnv]?.trim() ?? ''
	const fileApiKey = config.apiKey?.trim() ?? ''
	const apiKey = envApiKey || fileApiKey
	const apiKeySource: ApiKeySource = envApiKey ? 'env' : fileApiKey ? 'config' : 'missing'

	return { ...config, apiKey, apiKeyEnv, apiKeySource }
}

function resolveMatrixPrompt(configFile: string, baseSystemPrompt: string): ResolvedMatrixPrompt {
	const matrixPromptPath = join(dirname(configFile), 'MATRIX.md')

	try {
		const matrixPrompt = readFileSync(matrixPromptPath, 'utf8')
		return {
			error: null,
			path: matrixPromptPath,
			systemPrompt: `${baseSystemPrompt.trim()}\n\nFollow the instructions below from MATRIX.md.\n\n${matrixPrompt}`
		}
	} catch (error) {
		return {
			error: buildMatrixPromptError(matrixPromptPath, error),
			path: matrixPromptPath,
			systemPrompt: baseSystemPrompt
		}
	}
}

function buildMatrixPromptError(matrixPromptPath: string, error: unknown): string {
	const detail = error instanceof Error && error.message ? ` (${error.message})` : ''
	return `MATRIX.md is required before sending a reply. Create ${matrixPromptPath}.${detail}`
}
