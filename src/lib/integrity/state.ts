import { existsSync } from 'node:fs'

import type { AppPaths } from '../paths'
import { collectAuditIntegrityFindings } from './audit'
import { loadTrustedSigners } from './keys'
import { refreshMemoryIntegrity } from './memory'
import { collectSkillIntegrityFindings } from './skills'
import type { IntegrityCapability, IntegrityFinding, IntegrityStatus } from './types'

export function loadIntegrityStatus(paths: AppPaths): IntegrityStatus {
	const findings: IntegrityFinding[] = []
	const killSwitchActive = existsSync(paths.denyFile)

	if (killSwitchActive) {
		findings.push({
			blockingCapabilities: ['memory', 'persistentCapabilities', 'skills'],
			message: `Restricted mode is active because ${paths.denyFile} exists.`,
			scope: 'killSwitch'
		})
	}

	try {
		loadTrustedSigners(paths)
	} catch (error) {
		findings.push({
			blockingCapabilities: ['memory', 'skills'],
			message: `Signing keys are unavailable: ${error instanceof Error ? error.message : 'Unknown error.'}`,
			scope: 'keys'
		})
	}

	try {
		findings.push(...collectAuditIntegrityFindings(paths))
	} catch (error) {
		findings.push({
			blockingCapabilities: ['audit', 'persistentCapabilities'],
			message: `Audit validation failed: ${error instanceof Error ? error.message : 'Unknown error.'}`,
			scope: 'audit'
		})
	}

	try {
		findings.push(...refreshMemoryIntegrity(paths))
	} catch (error) {
		findings.push({
			blockingCapabilities: ['memory'],
			message: `Memory validation failed: ${error instanceof Error ? error.message : 'Unknown error.'}`,
			scope: 'memory'
		})
	}

	try {
		findings.push(...collectSkillIntegrityFindings(paths))
	} catch (error) {
		findings.push({
			blockingCapabilities: ['skills'],
			message: `Skill validation failed: ${error instanceof Error ? error.message : 'Unknown error.'}`,
			scope: 'skills'
		})
	}

	return {
		capabilities: {
			auditTrusted: !isCapabilityBlocked(findings, 'audit'),
			memoryTrusted: !isCapabilityBlocked(findings, 'memory'),
			persistentCapabilitiesTrusted: !isCapabilityBlocked(findings, 'persistentCapabilities'),
			skillsTrusted: !isCapabilityBlocked(findings, 'skills')
		},
		findings,
		killSwitchActive
	}
}

function isCapabilityBlocked(findings: IntegrityFinding[], capability: IntegrityCapability): boolean {
	return findings.some(finding => finding.blockingCapabilities.includes(capability))
}
