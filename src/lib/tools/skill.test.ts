import { afterEach, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { resolveAppPaths } from '../paths'
import { executeSkillTool } from './skill'

const cleanupPaths: string[] = []

afterEach(() => {
	for (const path of cleanupPaths.splice(0).toReversed()) {
		rmSync(path, { force: true, recursive: true })
	}
})

test('lists and invokes local skills from app storage', () => {
	const appPaths = createAppPaths()
	const skillDirectory = join(appPaths.skillsDir, 'summarize')
	mkdirSync(skillDirectory, { recursive: true })
	writeFileSync(join(skillDirectory, 'SKILL.md'), '# Summarize\n\nUse concise bullets.\n')
	writeFileSync(join(skillDirectory, 'notes.md'), 'extra context\n')

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

function createAppPaths(): ReturnType<typeof resolveAppPaths> {
	const homeDir = mkdtempSync(join(tmpdir(), 'kestrion-skill-home-'))
	cleanupPaths.push(homeDir)
	return resolveAppPaths({ homeDir })
}
