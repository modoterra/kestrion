export function findLineIndex(frame: string, pattern: string): number {
	return frame.split('\n').findIndex(line => line.includes(pattern))
}

export function findLineStart(frame: string, pattern: string): number {
	return (
		frame
			.split('\n')
			.map(line => line.indexOf(pattern))
			.find(index => index >= 0) ?? -1
	)
}

export function tailLines(frame: string, count: number): string {
	return frame.split('\n').slice(-count).join('\n')
}
