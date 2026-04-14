import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'

export function createWorkspaceRoot(prefix: string, registerCleanup: (path: string) => void): string {
	const path = mkdtempSync(join(process.cwd(), prefix))
	registerCleanup(path)
	return path
}
