import { cpSync, existsSync, mkdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'

export type AppPaths = {
	agentDir: string
	appName: string
	auditDir: string
	configDir: string
	configFile: string
	dataDir: string
	databaseFile: string
	legacyDataDir: string
	runtimeDir: string
	socketFile: string
	skillsDir: string
}

type ResolveAppPathsOptions = {
	appName?: string
	configRootName?: string
	dataRootName?: string
	homeDir?: string
	runtimeDir?: string
}

export function resolveAppPaths(options: ResolveAppPathsOptions = {}): AppPaths {
	const appName = options.appName ?? 'kestrion'
	const homeDir = options.homeDir ?? resolveHomeDirectory()
	const useConfiguredHomes = options.homeDir === undefined
	const configDir = resolveConfigDirectory(homeDir, appName, options.configRootName, useConfiguredHomes)
	const legacyDataDir = join(homeDir, '.share', appName)
	const dataDir = resolveDataDirectory(homeDir, appName, options.dataRootName, useConfiguredHomes)
	const runtimeDir = options.runtimeDir ?? resolveRuntimeDirectory(appName)
	migrateLegacyDataDirectory(legacyDataDir, dataDir)
	const agentDir = join(dataDir, 'agent')
	const auditDir = join(dataDir, 'audit')
	const skillsDir = join(dataDir, 'skills')

	ensureDirectory(configDir)
	ensureDirectory(dataDir)
	ensureDirectory(agentDir)
	ensureDirectory(auditDir)
	ensureDirectory(runtimeDir)
	ensureDirectory(skillsDir)

	return {
		agentDir,
		appName,
		auditDir,
		configDir,
		configFile: join(configDir, 'config.json'),
		dataDir,
		databaseFile: join(dataDir, 'kestrion.sqlite'),
		legacyDataDir,
		runtimeDir,
		socketFile: join(runtimeDir, `${appName}.sock`),
		skillsDir
	}
}

function ensureDirectory(path: string): void {
	mkdirSync(path, { recursive: true })
}

function resolveHomeDirectory(): string {
	return process.env.HOME ?? process.env.USERPROFILE ?? process.cwd()
}

function resolveConfigDirectory(
	homeDir: string,
	appName: string,
	configRootName: string | undefined,
	useConfiguredHomes: boolean
): string {
	if (configRootName) {
		return join(homeDir, configRootName, appName)
	}

	const configuredConfigHome = useConfiguredHomes ? process.env.XDG_CONFIG_HOME?.trim() : undefined
	if (configuredConfigHome) {
		return join(configuredConfigHome, appName)
	}

	return join(homeDir, '.config', appName)
}

function resolveDataDirectory(
	homeDir: string,
	appName: string,
	dataRootName: string | undefined,
	useConfiguredHomes: boolean
): string {
	if (dataRootName) {
		return join(homeDir, dataRootName, appName)
	}

	const configuredDataHome = useConfiguredHomes ? process.env.XDG_DATA_HOME?.trim() : undefined
	if (configuredDataHome) {
		return join(configuredDataHome, appName)
	}

	return join(homeDir, '.local/share', appName)
}

function migrateLegacyDataDirectory(legacyDataDir: string, dataDir: string): void {
	if (!existsSync(legacyDataDir) || existsSync(dataDir)) {
		return
	}

	const parentDirectory = join(dataDir, '..')
	ensureDirectory(parentDirectory)

	try {
		renameSync(legacyDataDir, dataDir)
	} catch {
		cpSync(legacyDataDir, dataDir, { recursive: true })
	}
}

function resolveRuntimeDirectory(appName: string): string {
	const configuredRuntimeDir = process.env.KESTRION_RUNTIME_DIR?.trim()
	if (configuredRuntimeDir) {
		return configuredRuntimeDir
	}

	const runtimeRoot = process.env.XDG_RUNTIME_DIR?.trim()
	if (runtimeRoot) {
		return join(runtimeRoot, appName)
	}

	return join('/tmp', `${appName}-${resolveRuntimeSuffix()}`)
}

function resolveRuntimeSuffix(): string {
	return process.env.UID?.trim() || process.getuid?.().toString() || 'user'
}
