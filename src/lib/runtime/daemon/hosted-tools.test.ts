import { expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { resolveAppPaths } from '../../paths'
import type { ToolInvocationAuditRecord } from '../../tools/tool-types'
import { executeDaemonHostedToolRequest } from './hosted-tools'

test('executes fetch through the daemon host bridge and emits an audit record', async () => {
	const homeDir = mkdtempSync(join(tmpdir(), 'kestrion-hosted-fetch-'))
	const paths = resolveAppPaths({ homeDir })
	const auditRecords: ToolInvocationAuditRecord[] = []

	try {
		const response = await executeDaemonHostedToolRequest(
			paths,
			{
				argumentsJson: JSON.stringify({ url: 'https://example.com/docs' }),
				requestId: 'request-1',
				toolName: 'fetch',
				type: 'hostToolRequest'
			},
			{
				fetchGatewayRequester: () =>
					Promise.resolve({
						body: 'hello world',
						headers: { 'content-type': 'text/plain' },
						status: 200,
						url: 'https://example.com/docs'
					}),
				fetchGatewayResolver: () => Promise.resolve([{ address: '93.184.216.34', family: 4 }]),
				onAuditRecord: record => {
					auditRecords.push(record)
				}
			}
		)

		expect(response.type).toBe('hostToolResponse')
		if (response.type !== 'hostToolResponse') {
			throw new Error('expected hostToolResponse')
		}
		expect(response.result).toContain('"ok":true')
		expect(auditRecords).toEqual([
			expect.objectContaining({
				contentType: 'text/plain',
				finalUrl: 'https://example.com/docs',
				responseStatus: 200,
				status: 'success',
				toolName: 'fetch'
			})
		])
	} finally {
		rmSync(homeDir, { force: true, recursive: true })
	}
})

test('executes skill loads through the daemon host bridge without plugin execution', async () => {
	const homeDir = mkdtempSync(join(tmpdir(), 'kestrion-hosted-skill-'))
	const paths = resolveAppPaths({ homeDir })
	const skillDirectory = join(paths.skillsDir, 'release-notes')
	mkdirSync(skillDirectory, { recursive: true })
	writeFileSync(join(skillDirectory, 'SKILL.md'), '# Release Notes\n\nSummarize the important changes.\n')

	try {
		const response = await executeDaemonHostedToolRequest(paths, {
			argumentsJson: JSON.stringify({ action: 'invoke', name: 'release-notes' }),
			requestId: 'request-2',
			toolName: 'skill',
			type: 'hostToolRequest'
		})

		expect(response.type).toBe('hostToolResponse')
		if (response.type !== 'hostToolResponse') {
			throw new Error('expected hostToolResponse')
		}
		expect(response.result).toContain('Summarize the important changes')
	} finally {
		rmSync(homeDir, { force: true, recursive: true })
	}
})
