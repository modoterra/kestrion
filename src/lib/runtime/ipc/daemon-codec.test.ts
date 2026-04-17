import { expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createRenderAppContext } from '../../../test/render-app-context'
import { loadIntegrityStatus } from '../../integrity/state'
import { decodeDaemonRequest, decodeDaemonResponse, encodeDaemonRequest, encodeDaemonResponse } from './daemon-codec'

test('daemon codec round-trips bootstrap request and response payloads', () => {
	const homeDir = mkdtempSync(join(tmpdir(), 'kestrion-daemon-codec-'))

	try {
		const { agentService, config, paths, store, writableConfig } = createRenderAppContext(homeDir, {
			providerConfigured: true
		})
		const conversations = agentService.listConversations()
		const bootstrap = {
			config,
			conversations,
			fireworksModels: agentService.listProviderModels('fireworks'),
			integrity: loadIntegrityStatus(paths),
			thread: agentService.getStartupThread(conversations),
			writableConfig
		}

		expect(decodeDaemonRequest(encodeDaemonRequest({ id: 'bootstrap-1', type: 'bootstrap' }))).toEqual({
			id: 'bootstrap-1',
			type: 'bootstrap'
		})
		expect(
			decodeDaemonResponse(encodeDaemonResponse({ id: 'bootstrap-1', ok: true, result: bootstrap, type: 'response' }))
		).toEqual({ id: 'bootstrap-1', ok: true, result: bootstrap, type: 'response' })

		store.close()
	} finally {
		rmSync(homeDir, { force: true, recursive: true })
	}
})

test('daemon codec rejects wrong protocol and wrong version', () => {
	const encoder = new TextEncoder()

	expect(() =>
		decodeDaemonRequest(
			encoder.encode(
				JSON.stringify({
					messageId: 'bootstrap-1',
					payload: { request: { type: 'bootstrap' }, type: 'request' },
					protocol: 'wrong-protocol',
					version: 1
				})
			)
		)
	).toThrow('protocol')

	expect(() =>
		decodeDaemonRequest(
			encoder.encode(
				JSON.stringify({
					messageId: 'bootstrap-1',
					payload: { request: { type: 'bootstrap' }, type: 'request' },
					protocol: 'kestrion-daemon-v1',
					version: 2
				})
			)
		)
	).toThrow('version')
})
