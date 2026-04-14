import type { CliRenderer } from '@opentui/core'

type ClipboardRenderer = Pick<CliRenderer, 'copyToClipboardOSC52'>
type SelectionRenderer = ClipboardRenderer & {
	clearSelection: () => void
	getSelection: () => { getSelectedText: () => string } | null
}

type NativeCopy = (text: string) => Promise<void>

export async function copySelectedText(
	renderer: SelectionRenderer,
	nativeCopy: NativeCopy = copyWithNativeClipboard
): Promise<boolean> {
	const text = renderer.getSelection()?.getSelectedText()
	if (!text) {
		return false
	}

	await copyTextToClipboard(renderer, text, nativeCopy)
	renderer.clearSelection()
	return true
}

export async function copyTextToClipboard(
	renderer: ClipboardRenderer,
	text: string,
	nativeCopy: NativeCopy = copyWithNativeClipboard
): Promise<boolean> {
	if (!text) {
		return false
	}

	renderer.copyToClipboardOSC52(text)

	try {
		await nativeCopy(text)
	} catch {
		// OSC52 is still useful even when local clipboard commands are unavailable.
	}

	return true
}

async function copyWithNativeClipboard(text: string): Promise<void> {
	const command = getClipboardCommand()
	if (!command) {
		return
	}

	const proc = Bun.spawn(command, { stdin: 'pipe', stderr: 'ignore', stdout: 'ignore' })

	if (!proc.stdin) {
		return
	}

	proc.stdin.write(text)
	proc.stdin.end()
	await proc.exited.catch(() => {})
}

function getClipboardCommand(): string[] | null {
	if (process.platform === 'darwin' && Bun.which('pbcopy')) {
		return ['pbcopy']
	}

	if (process.platform === 'linux') {
		if (process.env['WAYLAND_DISPLAY'] && Bun.which('wl-copy')) {
			return ['wl-copy']
		}

		if (Bun.which('xclip')) {
			return ['xclip', '-selection', 'clipboard']
		}

		if (Bun.which('xsel')) {
			return ['xsel', '--clipboard', '--input']
		}
	}

	if (process.platform === 'win32') {
		if (Bun.which('clip.exe')) {
			return ['clip.exe']
		}

		if (Bun.which('clip')) {
			return ['clip']
		}
	}

	return null
}
