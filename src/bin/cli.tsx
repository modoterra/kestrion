import { createCliRenderer } from '@opentui/core'
import { createRoot } from '@opentui/react'

import { App } from '../app'
import '../opentui-extensions'
import { quitApplication } from '../lib/app/quit'
import { resolveAppPaths } from '../lib/paths'
import { DaemonClient } from '../lib/runtime/daemon/client'

const packageInfo = (await Bun.file(new URL('../../package.json', import.meta.url)).json()) as {
	buildHash?: string
	version?: string
}
const buildLabel = `v${packageInfo.version ?? '0.0.0'}${packageInfo.buildHash ? ` (${packageInfo.buildHash})` : ''}`

const paths = resolveAppPaths()
const { bootstrap, client } = await DaemonClient.connect(paths)

const renderer = await createCliRenderer({
	exitOnCtrlC: false,
	onDestroy: () => {
		client.close()
	}
})

createRoot(renderer).render(
	<App
		buildLabel={buildLabel}
		config={bootstrap.config}
		fireworksModels={bootstrap.fireworksModels}
		initialConversations={bootstrap.conversations}
		initialThread={bootstrap.thread}
		initialWritableConfig={bootstrap.writableConfig}
		onExit={() => {
			quitApplication(renderer)
		}}
		paths={paths}
		service={client}
	/>
)
