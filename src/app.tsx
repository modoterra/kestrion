import type { ReactNode } from 'react'

import './opentui-extensions'
import { MainScreen } from './components/screens/main/screen'
import type { AppProps } from './lib/app/types'
import { ViewStackProvider } from './lib/navigation/view-stack'
import { KeyboardProvider } from './lib/ui/keyboard'

export function App(props: AppProps): ReactNode {
	return (
		<ViewStackProvider>
			<KeyboardProvider>
				<MainScreen {...props} />
			</KeyboardProvider>
		</ViewStackProvider>
	)
}
