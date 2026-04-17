import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import type { AppPaths } from '../paths'
import { sha256Hex, stableStringify } from './common'
import type { IntegrityFinding } from './types'

type AuditEnvelope = { entry: Record<string, unknown>; hash: string; prevHash: string }

export function buildAuditEnvelope(entry: Record<string, unknown>, prevHash: string): AuditEnvelope {
	return { entry, hash: sha256Hex(stableStringify({ entry, prevHash })), prevHash }
}

export function getPreviousAuditHash(auditFile: string): string {
	if (!existsSync(auditFile)) {
		return ''
	}

	const content = readFileSync(auditFile, 'utf8').trim()
	if (!content) {
		return ''
	}

	const lastLine = content.split('\n').at(-1)
	if (!lastLine) {
		return ''
	}

	try {
		return (JSON.parse(lastLine) as AuditEnvelope).hash ?? ''
	} catch {
		return ''
	}
}

export function collectAuditIntegrityFindings(paths: AppPaths): IntegrityFinding[] {
	const findings: IntegrityFinding[] = []
	const auditFiles = readdirSync(paths.auditDir)
		.filter(entry => entry.endsWith('.jsonl'))
		.toSorted((left, right) => left.localeCompare(right))

	for (const auditFileName of auditFiles) {
		const auditFile = join(paths.auditDir, auditFileName)
		const lines = readFileSync(auditFile, 'utf8')
			.split('\n')
			.filter(line => line.trim())
		let previousHash = ''

		for (const [index, line] of lines.entries()) {
			try {
				const envelope = JSON.parse(line) as AuditEnvelope
				const expectedHash = sha256Hex(stableStringify({ entry: envelope.entry, prevHash: previousHash }))
				if (envelope.prevHash !== previousHash || envelope.hash !== expectedHash) {
					findings.push({
						blockingCapabilities: ['audit', 'persistentCapabilities'],
						message: `Audit continuity check failed for ${auditFileName} at line ${index + 1}.`,
						scope: 'audit'
					})
					break
				}

				previousHash = envelope.hash
			} catch {
				findings.push({
					blockingCapabilities: ['audit', 'persistentCapabilities'],
					message: `Audit log ${auditFileName} contains unreadable entries.`,
					scope: 'audit'
				})
				break
			}
		}
	}

	return findings
}
