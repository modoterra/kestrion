import { afterEach, expect, test } from 'bun:test'
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createRenderAppContext } from '../../test/render-app-context'
import { resolveAppPaths } from '../paths'
import { DaemonController } from '../runtime/daemon/controller'
import type { TurnRunner } from '../runtime/worker/turn-runner'
import { buildAuditEnvelope } from './audit'
import { loadIntegrityStatus } from './state'

const cleanupPaths: string[] = []

afterEach(() => {
	for (const path of cleanupPaths.splice(0).toReversed()) {
		rmSync(path, { force: true, recursive: true })
	}
})

test('kill switch disables trusted skills and memory without preventing integrity loading', () => {
	const paths = createAppPaths()
	writeFileSync(paths.denyFile, '')

	const status = loadIntegrityStatus(paths)

	expect(status.killSwitchActive).toBe(true)
	expect(status.capabilities.memoryTrusted).toBe(false)
	expect(status.capabilities.skillsTrusted).toBe(false)
	expect(status.findings).toEqual(expect.arrayContaining([expect.objectContaining({ scope: 'killSwitch' })]))
})

test('broken audit continuity blocks audit trust', () => {
	const paths = createAppPaths()
	const auditFile = join(paths.auditDir, '2026-04-16.jsonl')
	const first = buildAuditEnvelope({ timestamp: '2026-04-16T00:00:00.000Z', tool: 'bash' }, '')
	appendFileSync(auditFile, `${JSON.stringify(first)}\n`)
	appendFileSync(
		auditFile,
		`${JSON.stringify({ entry: { timestamp: '2026-04-16T00:01:00.000Z', tool: 'read' }, hash: 'bad', prevHash: 'bad' })}\n`
	)

	const status = loadIntegrityStatus(paths)

	expect(status.capabilities.auditTrusted).toBe(false)
	expect(status.capabilities.persistentCapabilitiesTrusted).toBe(false)
	expect(status.findings).toEqual(expect.arrayContaining([expect.objectContaining({ scope: 'audit' })]))
})

test('daemon bootstrap exposes integrity status', async () => {
	const homeDir = mkdtempSync(join(tmpdir(), 'kestrion-integrity-bootstrap-'))
	cleanupPaths.push(homeDir)
	const { agentService, config, paths, store } = createRenderAppContext(homeDir, { providerConfigured: true })
	writeFileSync(paths.denyFile, '')
	const runner: TurnRunner = {
		startSession: async () => {
			throw new Error('Not used in bootstrap test.')
		}
	}
	const controller = new DaemonController(store, agentService, paths, runner, config)

	try {
		const bootstrap = await controller.bootstrap()
		expect(bootstrap.integrity.killSwitchActive).toBe(true)
		expect(bootstrap.integrity.capabilities.memoryTrusted).toBe(false)
	} finally {
		store.close()
	}
})

function createAppPaths(): ReturnType<typeof resolveAppPaths> {
	const homeDir = mkdtempSync(join(tmpdir(), 'kestrion-integrity-home-'))
	cleanupPaths.push(homeDir)
	return resolveAppPaths({ homeDir })
}
