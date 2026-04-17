import { afterEach, expect, test } from 'bun:test'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { signPayload } from '../integrity/keys'
import { resolveAppPaths } from '../paths'
import { executeSkillTool } from './skill'

const cleanupPaths: string[] = []

afterEach(() => {
	for (const path of cleanupPaths.splice(0).toReversed()) {
		rmSync(path, { force: true, recursive: true })
	}
})

test('lists and invokes signed local skills from app storage', () => {
	const appPaths = createAppPaths()
	const skillDirectory = join(appPaths.skillsDir, 'summarize')
	mkdirSync(skillDirectory, { recursive: true })
	writeFileSync(join(skillDirectory, 'SKILL.md'), '# Summarize\n\nUse concise bullets.\n')
	writeFileSync(join(skillDirectory, 'notes.md'), 'extra context\n')
	writeSkillSignature(appPaths, 'summarize')

	const listResult = JSON.parse(executeSkillTool(JSON.stringify({ action: 'list' }), { appPaths })) as {
		items: Array<{ name: string }>
		ok: boolean
	}
	const invokeResult = JSON.parse(
		executeSkillTool(JSON.stringify({ action: 'invoke', include: ['notes.md'], name: 'summarize' }), { appPaths })
	) as { files: Array<{ path: string }>; name: string; ok: boolean; skill: string }

	expect(listResult.ok).toBe(true)
	expect(listResult.items[0]?.name).toBe('summarize')
	expect(invokeResult.ok).toBe(true)
	expect(invokeResult.name).toBe('summarize')
	expect(invokeResult.skill).toContain('Use concise bullets')
	expect(invokeResult.files).toHaveLength(2)
})

test('rejects modified signed skills', () => {
	const appPaths = createAppPaths()
	const skillDirectory = join(appPaths.skillsDir, 'summarize')
	mkdirSync(skillDirectory, { recursive: true })
	writeFileSync(join(skillDirectory, 'SKILL.md'), '# Summarize\n\nUse concise bullets.\n')
	writeSkillSignature(appPaths, 'summarize')
	writeFileSync(join(skillDirectory, 'SKILL.md'), '# Summarize\n\nDo something else.\n')

	const result = JSON.parse(
		executeSkillTool(JSON.stringify({ action: 'invoke', name: 'summarize' }), { appPaths })
	) as { error: string; ok: boolean }

	expect(result.ok).toBe(false)
	expect(result.error).toContain('does not match the current file set')
})

test('hides skills with missing signatures from list results', () => {
	const appPaths = createAppPaths()
	const skillDirectory = join(appPaths.skillsDir, 'unsigned-skill')
	mkdirSync(skillDirectory, { recursive: true })
	writeFileSync(join(skillDirectory, 'SKILL.md'), '# Unsigned\n')

	const result = JSON.parse(executeSkillTool(JSON.stringify({ action: 'list' }), { appPaths })) as {
		items: Array<{ name: string }>
		ok: boolean
	}

	expect(result.ok).toBe(true)
	expect(result.items).toEqual([])
})

test('rejects skill signatures from untrusted signers', () => {
	const appPaths = createAppPaths()
	const skillDirectory = join(appPaths.skillsDir, 'foreign')
	mkdirSync(skillDirectory, { recursive: true })
	writeFileSync(join(skillDirectory, 'SKILL.md'), '# Foreign\n')
	writeFileSync(join(skillDirectory, '.sig'), JSON.stringify(signWithExternalKey(skillDirectory, 'foreign')))

	const result = JSON.parse(executeSkillTool(JSON.stringify({ action: 'invoke', name: 'foreign' }), { appPaths })) as {
		error: string
		ok: boolean
	}

	expect(result.ok).toBe(false)
	expect(result.error).toContain('not trusted')
})

test('rejects included files that escape the skill directory', () => {
	const appPaths = createAppPaths()
	const skillDirectory = join(appPaths.skillsDir, 'summarize')
	mkdirSync(skillDirectory, { recursive: true })
	writeFileSync(join(skillDirectory, 'SKILL.md'), '# Summarize\n\nUse concise bullets.\n')
	writeFileSync(join(appPaths.skillsDir, 'outside.md'), 'nope\n')
	writeSkillSignature(appPaths, 'summarize')

	const result = JSON.parse(
		executeSkillTool(JSON.stringify({ action: 'invoke', include: ['../outside.md'], name: 'summarize' }), { appPaths })
	) as { error: string; ok: boolean }

	expect(result.ok).toBe(false)
	expect(result.error).toContain('outside the skill directory')
})

function createAppPaths(): ReturnType<typeof resolveAppPaths> {
	const homeDir = mkdtempSync(join(tmpdir(), 'kestrion-skill-home-'))
	cleanupPaths.push(homeDir)
	return resolveAppPaths({ homeDir })
}

function writeSkillSignature(appPaths: ReturnType<typeof resolveAppPaths>, skillName: string): void {
	const skillDirectory = join(appPaths.skillsDir, skillName)
	const payload = { files: collectManifest(skillDirectory), skillName }
	const signed = signPayload(appPaths, payload)
	writeFileSync(join(skillDirectory, '.sig'), JSON.stringify(signed))
}

function signWithExternalKey(
	skillDirectory: string,
	skillName: string
): { payload: Record<string, unknown>; signature: string; signerKeyId: string } {
	const keyPair = generateKeyPairSync('ed25519')
	const publicKeyPem = keyPair.publicKey.export({ format: 'pem', type: 'spki' }).toString()
	const payload = { files: collectManifest(skillDirectory), skillName }
	return {
		payload,
		signature: sign(null, Buffer.from(JSON.stringify(payload)), keyPair.privateKey).toString('base64'),
		signerKeyId: createHash('sha256').update(publicKeyPem.trim()).digest('hex')
	}
}

function collectManifest(skillDirectory: string): Array<{ path: string; sha256: string; sizeBytes: number }> {
	return readdirSync(skillDirectory, { withFileTypes: true })
		.filter(entry => entry.isFile() && entry.name !== '.sig')
		.map(entry => {
			const path = join(skillDirectory, entry.name)
			const content = readFileSync(path)
			return {
				path: entry.name,
				sha256: createHash('sha256').update(content).digest('hex'),
				sizeBytes: content.byteLength
			}
		})
		.toSorted((left, right) => left.path.localeCompare(right.path))
}
