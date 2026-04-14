import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

export type AppPaths = {
	appName: string
	configDir: string
	configFile: string
	dataDir: string
	databaseFile: string
	skillsDir: string
}

type ResolveAppPathsOptions = { appName?: string; configRootName?: string; dataRootName?: string; homeDir?: string }

export function resolveAppPaths(options: ResolveAppPathsOptions = {}): AppPaths {
	const appName = options.appName ?? 'kestrion'
	const homeDir = options.homeDir ?? resolveHomeDirectory()
	const configDir = join(homeDir, options.configRootName ?? '.config', appName)
	const dataDir = join(homeDir, options.dataRootName ?? '.share', appName)
	const skillsDir = join(dataDir, 'skills')

	ensureDirectory(configDir)
	ensureDirectory(dataDir)
	ensureDirectory(skillsDir)

	return {
		appName,
		configDir,
		configFile: join(configDir, 'config.json'),
		dataDir,
		databaseFile: join(dataDir, 'kestrion.sqlite'),
		skillsDir
	}
}

function ensureDirectory(path: string): void {
	mkdirSync(path, { recursive: true })
}

function resolveHomeDirectory(): string {
	return process.env.HOME ?? process.env.USERPROFILE ?? process.cwd()
}
