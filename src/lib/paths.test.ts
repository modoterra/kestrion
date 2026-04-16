import { afterEach, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { resolveAppPaths } from './paths'

const cleanupPaths: string[] = []
const originalRuntimeDir = process.env.KESTRION_RUNTIME_DIR
const originalConfigHome = process.env.XDG_CONFIG_HOME
const originalDataHome = process.env.XDG_DATA_HOME
const originalHome = process.env.HOME
const originalUserProfile = process.env.USERPROFILE

afterEach(() => {
	if (originalRuntimeDir === undefined) {
		delete process.env.KESTRION_RUNTIME_DIR
	} else {
		process.env.KESTRION_RUNTIME_DIR = originalRuntimeDir
	}

	if (originalConfigHome === undefined) {
		delete process.env.XDG_CONFIG_HOME
	} else {
		process.env.XDG_CONFIG_HOME = originalConfigHome
	}

	if (originalDataHome === undefined) {
		delete process.env.XDG_DATA_HOME
	} else {
		process.env.XDG_DATA_HOME = originalDataHome
	}

	if (originalHome === undefined) {
		delete process.env.HOME
	} else {
		process.env.HOME = originalHome
	}

	if (originalUserProfile === undefined) {
		delete process.env.USERPROFILE
	} else {
		process.env.USERPROFILE = originalUserProfile
	}

	for (const path of cleanupPaths.splice(0).toReversed()) {
		rmSync(path, { force: true, recursive: true })
	}
})

test('migrates legacy ~/.share data into ~/.local/share', () => {
	const homeDir = mkdtempSync(join(tmpdir(), 'kestrion-paths-'))
	const legacyDataDir = join(homeDir, '.share', 'kestrion')
	mkdirSync(legacyDataDir, { recursive: true })
	writeFileSync(join(legacyDataDir, 'legacy.txt'), 'hello from legacy storage\n')
	cleanupPaths.push(homeDir)
	delete process.env.XDG_CONFIG_HOME
	delete process.env.XDG_DATA_HOME

	const paths = resolveAppPaths({ homeDir, runtimeDir: join(homeDir, '.runtime') })

	expect(existsSync(paths.dataDir)).toBe(true)
	expect(readFileSync(join(paths.dataDir, 'legacy.txt'), 'utf8')).toBe('hello from legacy storage\n')
})

test('uses KESTRION_RUNTIME_DIR when provided', () => {
	const homeDir = mkdtempSync(join(tmpdir(), 'kestrion-paths-'))
	const runtimeDir = join(homeDir, '.custom-runtime')
	cleanupPaths.push(homeDir)
	process.env.KESTRION_RUNTIME_DIR = runtimeDir
	delete process.env.XDG_CONFIG_HOME
	delete process.env.XDG_DATA_HOME

	const paths = resolveAppPaths({ homeDir })

	expect(paths.runtimeDir).toBe(runtimeDir)
	expect(paths.socketFile).toBe(join(runtimeDir, 'kestrion.sock'))
})

test('uses XDG config and data homes when provided', () => {
	const homeDir = mkdtempSync(join(tmpdir(), 'kestrion-paths-'))
	const configHome = join(homeDir, 'config-root')
	const dataHome = join(homeDir, 'share-root')
	cleanupPaths.push(homeDir)
	process.env.HOME = homeDir
	process.env.USERPROFILE = homeDir
	process.env.XDG_CONFIG_HOME = configHome
	process.env.XDG_DATA_HOME = dataHome

	const paths = resolveAppPaths({ runtimeDir: join(homeDir, 'runtime-root') })

	expect(paths.configDir).toBe(join(configHome, 'kestrion'))
	expect(paths.dataDir).toBe(join(dataHome, 'kestrion'))
	expect(paths.databaseFile).toBe(join(dataHome, 'kestrion', 'kestrion.sqlite'))
})
