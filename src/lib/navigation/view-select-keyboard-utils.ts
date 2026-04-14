export type ViewSelectKeyboardEvent = {
	ctrl?: boolean
	defaultPrevented?: boolean
	meta?: boolean
	name: string
	option?: boolean
	preventDefault: () => void
	raw?: string
	sequence?: string
	stopPropagation: () => void
}

const CTRL_D = '\u0004'
const ALT_CTRL_D = '\u001B\u0004'

export function getNavigationDirection(key: ViewSelectKeyboardEvent): -1 | 0 | 1 {
	if (key.name === 'up' || (key.ctrl && key.name === 'p')) {
		return -1
	}

	if (key.name === 'down' || (key.ctrl && key.name === 'n')) {
		return 1
	}

	return 0
}

export function isDeleteCurrentKey(key: ViewSelectKeyboardEvent): boolean {
	return (
		key.ctrl === true &&
		!(key.meta || key.option) &&
		(key.name === 'd' || key.raw === CTRL_D || key.sequence === CTRL_D)
	)
}

export function isDeleteAllKey(key: ViewSelectKeyboardEvent): boolean {
	return (
		(key.ctrl === true && Boolean(key.meta || key.option) && key.name === 'd') ||
		key.raw === ALT_CTRL_D ||
		key.sequence === ALT_CTRL_D
	)
}

export function preventKeyboardEvent(key: ViewSelectKeyboardEvent): void {
	key.preventDefault()
	key.stopPropagation()
}
