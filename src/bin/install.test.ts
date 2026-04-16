import { describe, expect, test } from 'bun:test'

import { buildLauncherSource, buildServiceUnit } from './install'

describe('install', () => {
	test('launchers use bun from PATH instead of a pinned executable', () => {
		const launcherSource = buildLauncherSource('/tmp/kestrion/src/bin/cli.tsx')

		expect(launcherSource).toContain('command -v bun')
		expect(launcherSource).toContain(`exec bun '/tmp/kestrion/src/bin/cli.tsx' "$@"`)
		expect(launcherSource).not.toContain('process.execPath')
	})

	test('systemd service includes a Bun-friendly PATH', () => {
		const serviceUnit = buildServiceUnit('/tmp/kestrion')

		expect(serviceUnit).toContain('Environment=PATH=%h/.bun/bin:%h/.local/bin:/usr/local/bin:/usr/bin:/bin')
		expect(serviceUnit).toContain('ExecStart=%h/.local/bin/kestriond')
	})
})
