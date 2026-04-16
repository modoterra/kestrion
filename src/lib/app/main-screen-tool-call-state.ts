import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'

import type { ConversationThread, ToolCallMessageRecord } from '../types'
import type { AppProps } from './types'

export function useToolCallMessagesState(
	initialThread: AppProps['initialThread'],
	activeThread: ConversationThread
): [ToolCallMessageRecord[], Dispatch<SetStateAction<ToolCallMessageRecord[]>>] {
	const [toolCallMessages, setToolCallMessages] = useState<ToolCallMessageRecord[]>(initialThread.toolCallMessages)

	useEffect(() => {
		setToolCallMessages(activeThread.toolCallMessages)
	}, [activeThread.conversation.id, activeThread.toolCallMessages])

	return [toolCallMessages, setToolCallMessages]
}
