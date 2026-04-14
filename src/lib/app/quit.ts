type ExitProcess = (code?: number) => void

const defaultExitProcess = process.exit.bind(process) as ExitProcess

export function quitApplication(
	renderer: { destroy: () => void },
	exitProcess: ExitProcess = defaultExitProcess
): void {
	renderer.destroy()
	exitProcess(0)
}
