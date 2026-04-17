import type { ReactNode } from 'react'
import { Component } from 'react'

import { THEME } from '../../lib/ui/constants'

type AppErrorBoundaryProps = { children: ReactNode }
type AppErrorBoundaryState = { error: Error | null }

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
	override state: AppErrorBoundaryState = { error: null }

	static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
		return { error }
	}

	override componentDidCatch(error: Error): void {
		process.stderr.write(`Kestrion render error: ${error.stack ?? error.message}\n`)
	}

	override render(): ReactNode {
		if (!this.state.error) {
			return this.props.children
		}

		return (
			<box
				backgroundColor='black'
				flexDirection='column'
				height='100%'
				paddingLeft={2}
				paddingRight={2}
				paddingTop={1}
				width='100%'>
				<text
					fg={THEME.danger}
					selectable={false}>
					Kestrion failed to render
				</text>
				<text
					fg={THEME.offWhite}
					selectable>
					{this.state.error.message}
				</text>
				{this.state.error.stack ? (
					<text
						fg={THEME.muted}
						selectable>
						{this.state.error.stack}
					</text>
				) : null}
			</box>
		)
	}
}
