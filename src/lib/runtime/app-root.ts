import { realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export function resolveAppRoot(moduleUrl: string): string {
	const configuredAppRoot = process.env.KESTRION_APP_ROOT?.trim()
	if (configuredAppRoot) {
		return realpathSync(configuredAppRoot)
	}

	return realpathSync(join(dirname(fileURLToPath(moduleUrl)), '../..'))
}
