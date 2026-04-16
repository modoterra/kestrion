import { expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { createDevEnvironment } from './dev'

test('createDevEnvironment keeps config, data, and runtime inside the repo-local .runtime tree', () => {
	const environment = createDevEnvironment({ PATH: '/usr/bin' })

	expect(existsSync(environment.rootDir)).toBe(true)
	expect(environment.env.HOME).toBe(environment.rootDir)
	expect(environment.env.USERPROFILE).toBe(environment.rootDir)
	expect(environment.env.XDG_CONFIG_HOME).toBe(join(environment.rootDir, 'config'))
	expect(environment.env.XDG_DATA_HOME).toBe(join(environment.rootDir, 'share'))
	expect(environment.env.XDG_RUNTIME_DIR).toBe(environment.rootDir)
	expect(environment.env.KESTRION_RUNTIME_DIR).toBe(environment.rootDir)
	expect(environment.paths.configDir).toBe(join(environment.rootDir, 'config', 'kestrion'))
	expect(environment.paths.dataDir).toBe(join(environment.rootDir, 'share', 'kestrion'))
	expect(environment.paths.runtimeDir).toBe(environment.rootDir)
	expect(environment.paths.databaseFile).toBe(join(environment.rootDir, 'share', 'kestrion', 'kestrion.sqlite'))
	expect(environment.paths.socketFile).toBe(join(environment.rootDir, 'kestrion.sock'))
})
