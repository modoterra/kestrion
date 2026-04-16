export const RHYTHM = { pageX: 2, pageY: 1, panelX: 2, panelY: 1, stack: 1, section: 2 } as const

export const THEME = {
	canvas: 'transparent',
	panel: '#111111',
	panelRaised: '#181818',
	selectActive: '#2a2a2a',
	selectFocused: '#6b4fa3',
	composerPanel: '#1d1d1d',
	userSurface: '#303030',
	offWhite: '#d9d9d4',
	softText: '#bdbdb7',
	softLabel: '#9a9a94',
	providerBlue: '#98a8ff',
	focusAccent: '#b08cff',
	summaryAccent: '#d8bf63',
	logoShade1: '#fafafa',
	logoShade2: '#e5e5e5',
	logoShade3: '#cfcfcf',
	logoShade4: '#b8b8b8',
	logoShade5: '#a3a3a3',
	muted: 'gray',
	accent: '#8fa4ff',
	warning: 'yellow',
	danger: 'red',
	inverseBackground: 'white',
	inverseText: 'black'
} as const

export const COMPOSER_KEYBINDINGS: Array<{ name: string; action: 'submit' }> = [
	{ name: 'enter', action: 'submit' },
	{ name: 'return', action: 'submit' },
	{ name: 'linefeed', action: 'submit' }
]

export const SHORTCUTS = [
	{ command: 'ctrl+r', description: 'browse sessions', footerLabel: 'sessions' },
	{ command: 'ctrl+m', description: 'browse memories', footerLabel: 'memory' },
	{ command: 'ctrl+n', description: 'start a new session', footerLabel: 'new' },
	{ command: 'ctrl+t', description: 'browse tools' },
	{ command: 'ctrl+y', description: 'show wire transcript', footerLabel: 'transcript' },
	{ command: 'ctrl+k', description: 'open commands', footerLabel: 'commands' },
	{ command: 'ctrl+p', description: 'open providers', footerLabel: 'provider' },
	{ command: 'ctrl+g', description: 'show shortcuts', footerLabel: 'shortcuts' },
	{ command: 'esc', description: 'close or quit', footerLabel: 'quit' }
] as const
