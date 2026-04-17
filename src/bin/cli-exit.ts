import type { KeyEvent } from '@opentui/core'

const CTRL_D = '\u0004'

export function shouldExitCliForKey(
	key: Pick<KeyEvent, 'ctrl' | 'name' | 'raw' | 'sequence'>,
	appReady: boolean
): boolean {
	if (key.ctrl === true && key.name === 'c') {
		return true
	}

	if (!appReady && key.ctrl === true && (key.name === 'd' || key.raw === CTRL_D || key.sequence === CTRL_D)) {
		return true
	}

	return false
}
