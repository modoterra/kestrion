import { expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createDaemonLogger } from './logger'

test('writes daemon log entries to stdout when enabled', () => {
	const tempDir = mkdtempSync(join(tmpdir(), 'kestrion-daemon-logger-'))
	const logFile = join(tempDir, 'daemon.log')
	const stdoutLines: string[] = []

	try {
		const logger = createDaemonLogger(logFile, 'daemon.test', {
			stdout: true,
			stdoutWriter: line => {
				stdoutLines.push(line)
			}
		})

		logger.info('hello.world', { answer: 42 })

		expect(stdoutLines).toHaveLength(1)
		expect(stdoutLines[0]).toContain('"event":"hello.world"')
		expect(readFileSync(logFile, 'utf8')).toContain('"event":"hello.world"')
	} finally {
		rmSync(tempDir, { force: true, recursive: true })
	}
})
