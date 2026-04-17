import { expect, test } from 'bun:test'

import { resolveDaemonStartupOptions } from './startup-options'

test('enables stdout logging when the daemon flag is present', () => {
	expect(resolveDaemonStartupOptions(['--stdout-logs'])).toEqual({ logToStdout: true })
})

test('keeps stdout logging disabled by default', () => {
	expect(resolveDaemonStartupOptions([])).toEqual({ logToStdout: false })
})
