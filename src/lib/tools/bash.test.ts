import { afterEach, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { executeBashTool } from './bash'

const cleanupPaths: string[] = []

afterEach(() => {
	for (const path of cleanupPaths.splice(0).toReversed()) {
		rmSync(path, { force: true, recursive: true })
	}
})

test('runs a bash command in a workspace-relative directory', () => {
	const workspaceRoot = createTemporaryDirectory('kestrion-bash-workspace-')
	mkdirSync(join(workspaceRoot, 'src'), { recursive: true })

	const result = JSON.parse(executeBashTool(JSON.stringify({ command: 'pwd', path: 'src' }), { workspaceRoot })) as {
		cwd: string
		ok: boolean
		stdout: string
	}

	expect(result.ok).toBe(true)
	expect(result.cwd).toBe('src')
	expect(result.stdout.trim()).toBe(join(workspaceRoot, 'src'))
})

test('runs bash commands with a scrubbed environment', () => {
	const workspaceRoot = createTemporaryDirectory('kestrion-bash-env-')
	process.env.KESTRION_BASH_TEST_SECRET = 'top-secret'

	try {
		const result = JSON.parse(
			executeBashTool(JSON.stringify({ command: 'printf "%s" "${KESTRION_BASH_TEST_SECRET:-missing}"' }), {
				workspaceRoot
			})
		) as { ok: boolean; stdout: string }

		expect(result.ok).toBe(true)
		expect(result.stdout).toBe('missing')
	} finally {
		delete process.env.KESTRION_BASH_TEST_SECRET
	}
})

function createTemporaryDirectory(prefix: string): string {
	const path = mkdtempSync(join(tmpdir(), prefix))
	cleanupPaths.push(path)

	return path
}
