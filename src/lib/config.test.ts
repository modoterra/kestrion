import { afterEach, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { loadAppConfig, loadWritableAppConfig, saveAppConfig } from './config'
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
})
