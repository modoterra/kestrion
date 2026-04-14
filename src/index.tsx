import { createCliRenderer } from '@opentui/core'
import { createRoot } from '@opentui/react'

import { App } from './app'
import './opentui-extensions'
import { AgentService } from './lib/agent-service'
import { quitApplication } from './lib/app/quit'
import { loadAppConfig, loadWritableAppConfig } from './lib/config'
import { ConversationStore } from './lib/conversation-store'
import { resolveAppPaths } from './lib/paths'

const packageInfo = (await Bun.file(new URL('../package.json', import.meta.url)).json()) as {
	buildHash?: string
	version?: string
}
const buildLabel = `v${packageInfo.version ?? '0.0.0'}${packageInfo.buildHash ? ` (${packageInfo.buildHash})` : ''}`

const paths = resolveAppPaths()
const writableConfig = loadWritableAppConfig(paths)
const config = loadAppConfig(paths)
const store = new ConversationStore(paths.databaseFile)
const service = new AgentService(store, config)
const initialConversations = service.listConversations()
const initialThread = service.getStartupThread(initialConversations)

const renderer = await createCliRenderer({
	exitOnCtrlC: false,
	onDestroy: () => {
		store.close()
	}
})

createRoot(renderer).render(
	<App
		buildLabel={buildLabel}
		config={config}
		initialConversations={initialConversations}
		initialThread={initialThread}
		initialWritableConfig={writableConfig}
		onExit={() => {
			quitApplication(renderer)
		}}
		paths={paths}
		service={service}
	/>
)
