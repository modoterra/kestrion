import type { ReactNode } from 'react'

import { AppErrorBoundary } from './components/app/app-error-boundary'
import './opentui-extensions'
import { MainScreen } from './components/screens/main/screen'
import type { AppProps } from './lib/app/types'
import { ViewStackProvider } from './lib/navigation/view-stack'
import { KeyboardProvider } from './lib/ui/keyboard'

export function App(props: AppProps): ReactNode {
	return (
		<AppErrorBoundary>
			<ViewStackProvider>
				<KeyboardProvider>
					<MainScreen {...props} />
				</KeyboardProvider>
			</ViewStackProvider>
		</AppErrorBoundary>
	)
}
