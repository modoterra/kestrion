import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import type { AppPaths } from '../paths'
import { sha256Hex } from './common'
import { loadTrustedSigners, verifyPayloadSignature } from './keys'
import type { IntegrityFinding } from './types'

type SkillSignatureEnvelope = {
	payload: { files: Array<{ path: string; sha256: string; sizeBytes: number }>; skillName: string }
	signature: string
	signerKeyId: string
}

type VerifiedSkillResult = { ok: true } | { error: string; ok: false }

export function verifyManagedSkill(paths: AppPaths, skillName: string): VerifiedSkillResult {
	const skillDirectory = resolve(paths.skillsDir, skillName)
	const signatureFile = join(skillDirectory, '.sig')
	if (!existsSync(signatureFile)) {
		return { error: `Skill "${skillName}" is missing .sig.`, ok: false }
	}

	let signatureEnvelope: SkillSignatureEnvelope
	try {
		signatureEnvelope = JSON.parse(readFileSync(signatureFile, 'utf8')) as SkillSignatureEnvelope
	} catch (error) {
		return {
			error: `Skill "${skillName}" has an unreadable signature file: ${error instanceof Error ? error.message : 'Unknown error.'}`,
			ok: false
		}
	}

	const actualManifest = collectSkillManifest(skillDirectory)
	const payload = signatureEnvelope.payload
	if (payload.skillName !== skillName || !manifestsMatch(payload.files, actualManifest)) {
		return { error: `Skill "${skillName}" signature does not match the current file set.`, ok: false }
	}

	const verification = verifyPayloadSignature(
		loadTrustedSigners(paths),
		signatureEnvelope.signerKeyId,
		payload,
		signatureEnvelope.signature
	)
	return verification.ok
		? { ok: true }
		: { error: `Skill "${skillName}" failed verification: ${verification.error}`, ok: false }
}

export function collectSkillIntegrityFindings(paths: AppPaths): IntegrityFinding[] {
	if (!existsSync(paths.skillsDir)) {
		return []
	}

	return readdirSync(paths.skillsDir, { withFileTypes: true })
		.filter(entry => entry.isDirectory() && existsSync(join(paths.skillsDir, entry.name, 'SKILL.md')))
		.flatMap(entry => {
			const verification = verifyManagedSkill(paths, entry.name)
			return verification.ok
				? []
				: [
						{
							blockingCapabilities: ['skills'],
							message: verification.error,
							scope: 'skills'
						} satisfies IntegrityFinding
					]
		})
}

function collectSkillManifest(skillDirectory: string): Array<{ path: string; sha256: string; sizeBytes: number }> {
	return collectSkillFiles(skillDirectory)
		.filter(path => relative(skillDirectory, path) !== '.sig')
		.map(path => {
			const content = readFileSync(path)
			return {
				path: relative(skillDirectory, path).replaceAll('\\', '/'),
				sha256: sha256Hex(content),
				sizeBytes: content.byteLength
			}
		})
		.toSorted((left, right) => left.path.localeCompare(right.path))
}

function collectSkillFiles(currentDirectory: string): string[] {
	return readdirSync(currentDirectory, { withFileTypes: true }).flatMap(entry => {
		const nextPath = join(currentDirectory, entry.name)
		if (entry.isDirectory()) {
			return collectSkillFiles(nextPath)
		}

		if (!entry.isFile() || !statSync(nextPath).isFile()) {
			return []
		}

		return [nextPath]
	})
}

function manifestsMatch(
	left: Array<{ path: string; sha256: string; sizeBytes: number }>,
	right: Array<{ path: string; sha256: string; sizeBytes: number }>
): boolean {
	return JSON.stringify(left) === JSON.stringify(right)
}
