import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { resolveAppRoot } from '../lib/runtime/app-root'
import {
	CLI_BINARY_NAME,
	DAEMON_BINARY_NAME,
	WORKER_BINARY_NAME,
	resolveCliEntrypoint,
	resolveDaemonEntrypoint,
	resolveWorkerEntrypoint
} from '../lib/runtime/entrypoints'

if (import.meta.main) {
	runInstall()
}

export function runInstall(): void {
	const appRoot = resolveAppRoot(import.meta.url)
	const homeDir = resolveHomeDirectory()

	installLaunchers(appRoot, homeDir)
	installSystemdUserService(appRoot, homeDir)
	writeSummary()
}

function installLaunchers(appRoot: string, homeDir: string): void {
	const binDir = join(homeDir, '.local', 'bin')
	mkdirSync(binDir, { recursive: true })

	writeLauncher(binDir, CLI_BINARY_NAME, resolveCliEntrypoint(appRoot))
	writeLauncher(binDir, DAEMON_BINARY_NAME, resolveDaemonEntrypoint(appRoot))
	writeLauncher(binDir, WORKER_BINARY_NAME, resolveWorkerEntrypoint(appRoot))
}

function writeLauncher(binDir: string, binaryName: string, entrypointPath: string): void {
	const launcherPath = join(binDir, binaryName)
	const launcherSource = buildLauncherSource(entrypointPath)

	writeFileSync(launcherPath, launcherSource, 'utf8')
	chmodSync(launcherPath, 0o755)
}

function installSystemdUserService(appRoot: string, homeDir: string): void {
	const systemdDir = join(homeDir, '.config', 'systemd', 'user')
	const servicePath = join(systemdDir, `${DAEMON_BINARY_NAME}.service`)
	mkdirSync(systemdDir, { recursive: true })
	writeFileSync(servicePath, buildServiceUnit(appRoot), 'utf8')
}

export function buildLauncherSource(entrypointPath: string): string {
	return `#!/usr/bin/env sh
set -eu
if ! command -v bun >/dev/null 2>&1; then
	printf '%s\\n' 'bun was not found on PATH. Install Bun and try again.' >&2
	exit 127
fi
exec bun ${quoteShellLiteral(entrypointPath)} "$@"
`
}

export function buildServiceUnit(appRoot: string): string {
	return `[Unit]
Description=Kestrion daemon
After=default.target

[Service]
Environment=PATH=%h/.bun/bin:%h/.local/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=%h/.local/bin/${DAEMON_BINARY_NAME}
Restart=on-failure
RestartSec=1
WorkingDirectory=${appRoot}

[Install]
WantedBy=default.target
`
}

function writeSummary(): void {
	process.stdout.write(`Installed ${CLI_BINARY_NAME}, ${DAEMON_BINARY_NAME}, and ${WORKER_BINARY_NAME} to ~/.local/bin
Wrote ~/.config/systemd/user/${DAEMON_BINARY_NAME}.service
Launchers use the current user's bun from PATH
Next steps:
  systemctl --user daemon-reload
  systemctl --user enable --now ${DAEMON_BINARY_NAME}.service
`)
}

function resolveHomeDirectory(): string {
	const home = process.env.HOME ?? process.env.USERPROFILE
	if (!home) {
		throw new Error('Cannot determine the current user home directory.')
	}

	return home
}

function quoteShellLiteral(value: string): string {
	return `'${value.replaceAll("'", `'"'"'`)}'`
}
