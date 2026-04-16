import { afterEach, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { loadAppConfig, loadWritableAppConfig, resolveRuntimeAppConfig, saveAppConfig } from './config'
import { resolveAppPaths } from './paths'

const cleanupPaths: string[] = []

afterEach(() => {
	delete process.env.FIREWORKS_API_KEY

	for (const path of cleanupPaths.splice(0)) {
		rmSync(path, { force: true, recursive: true })
	}
})

test('creates a default config file and honors env overrides', () => {
	const homeDir = mkdtempSync(join(tmpdir(), 'kestrion-config-'))
	cleanupPaths.push(homeDir)

	process.env.FIREWORKS_API_KEY = 'env-secret'

	const paths = resolveAppPaths({ homeDir })
	writeMatrixPrompt(paths.configDir, '# Matrix\n\nFollow the mission.')
	const writableConfig = loadWritableAppConfig(paths)
	const savedConfig = saveAppConfig(paths, {
		...writableConfig,
		providers: {
			fireworks: {
				...writableConfig.providers.fireworks,
				apiKey: 'file-secret',
				baseUrl: 'https://example.com/v1',
				model: 'accounts/fireworks/models/test-model',
				providerMode: 'custom'
			}
		}
	})
	const config = loadAppConfig(paths)
	const fileContents = readFileSync(paths.configFile, 'utf8')

	expect(savedConfig.providers.fireworks.apiKey).toBe('env-secret')
	expect(config.providers.fireworks.apiKey).toBe('env-secret')
	expect(config.providers.fireworks.apiKeySource).toBe('env')
	expect(config.providers.fireworks.providerMode).toBe('custom')
	expect(fileContents).toContain('"defaultProvider": "fireworks"')
	expect(fileContents).toContain('"model": "accounts/fireworks/models/test-model"')
	expect(fileContents).toContain('"apiKey": "file-secret"')
	expect(fileContents).toContain('"providerMode": "custom"')
	expect(config.matrixPromptError).toBeNull()
	expect(config.matrixPromptPath).toBe(join(paths.configDir, 'MATRIX.md'))
	expect(config.systemPrompt).toContain('You are Kestrion, a terminal-first AI agent.')
	expect(config.systemPrompt).toContain('Follow the instructions below from MATRIX.md.')
	expect(config.systemPrompt).toContain('# Matrix')
})

test('resolveRuntimeAppConfig rehydrates env-backed API keys for worker processes', () => {
	process.env.FIREWORKS_API_KEY = 'env-secret'

	const config = resolveRuntimeAppConfig({
		configFile: '/tmp/config.json',
		defaultProvider: 'fireworks',
		matrixPromptError: null,
		matrixPromptPath: '/tmp/MATRIX.md',
		providers: {
			fireworks: {
				apiKey: '',
				apiKeyEnv: 'FIREWORKS_API_KEY',
				apiKeySource: 'missing',
				baseUrl: 'https://api.fireworks.ai/inference/v1',
				maxTokens: 1024,
				model: 'accounts/fireworks/models/kimi-k2p5',
				promptTruncateLength: 6000,
				providerMode: 'fireworks',
				temperature: 0.6
			}
		},
		systemPrompt: 'You are Kestrion.'
	})

	expect(config.providers.fireworks.apiKey).toBe('env-secret')
	expect(config.providers.fireworks.apiKeySource).toBe('env')
	expect(config.matrixPromptError).toBeNull()
	expect(config.matrixPromptPath).toBe('/tmp/MATRIX.md')
})

test('loadAppConfig records a missing MATRIX.md without failing bootstrap', () => {
	const homeDir = mkdtempSync(join(tmpdir(), 'kestrion-config-missing-matrix-'))
	cleanupPaths.push(homeDir)

	const paths = resolveAppPaths({ homeDir })
	const config = loadAppConfig(paths)

	expect(config.matrixPromptPath).toBe(join(paths.configDir, 'MATRIX.md'))
	expect(config.matrixPromptError).toContain('MATRIX.md is required before sending a reply.')
	expect(config.matrixPromptError).toContain(config.matrixPromptPath)
	expect(config.systemPrompt).toBe('You are Kestrion, a terminal-first AI agent.')
})

test('loaded MATRIX.md content is cached in resolved config until config is reloaded', () => {
	const homeDir = mkdtempSync(join(tmpdir(), 'kestrion-config-matrix-cache-'))
	cleanupPaths.push(homeDir)

	const paths = resolveAppPaths({ homeDir })
	writeMatrixPrompt(paths.configDir, '# Matrix\n\nAlpha directives.')

	const initialConfig = loadAppConfig(paths)
	writeMatrixPrompt(paths.configDir, '# Matrix\n\nBeta directives.')

	expect(initialConfig.systemPrompt).toContain('Alpha directives.')
	expect(initialConfig.systemPrompt).not.toContain('Beta directives.')

	const reloadedConfig = loadAppConfig(paths)

	expect(reloadedConfig.systemPrompt).toContain('Beta directives.')
})

function writeMatrixPrompt(configDir: string, content: string): void {
	writeFileSync(join(configDir, 'MATRIX.md'), content)
}
