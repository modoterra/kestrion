import { type Dispatch, type ReactNode, type SetStateAction, useEffect, useMemo, useState } from 'react'

import { useViewStack } from '../../../lib/navigation/view-stack'
import type { ConversationSummary } from '../../../lib/types'
import { formatConversationSummary } from '../../../lib/ui/helpers'
import { useKeyboardHandler } from '../../../lib/ui/keyboard'
import { ViewSelect } from '../../ui/navigation/view-select'

type KeyboardEventLike = { ctrl?: boolean; name: string; raw?: string; sequence?: string }
type SessionsViewProps = {
	conversations: ConversationSummary[]
	currentConversationId: string
	onDelete: (conversationId: string) => Promise<void>
	onDeleteAll: () => Promise<void>
	onOpen: (conversationId: string) => Promise<void>
}

export function SessionsScreen(props: SessionsViewProps): ReactNode {
	const { conversations, currentConversationId, onDelete, onDeleteAll, onOpen } = props
	const viewStack = useViewStack()
	const [items, setItems] = useState(conversations)

	useEffect(() => {
		setItems(conversations)
	}, [conversations])

	const options = useMemo(
		() =>
			items.map(conversation => ({
				description: formatConversationSummary(conversation),
				title: conversation.id === currentConversationId ? `${conversation.title} (current)` : conversation.title,
				value: conversation.id
			})),
		[items, currentConversationId]
	)

	useKeyboardHandler(key => {
		if (!isCloseSessionsKey(key)) {
			return
		}

		viewStack.pop()
		key.preventDefault()
		key.stopPropagation()
	})

	return (
		<ViewSelect
			onDeleteAll={() => resetConversations(setItems, onDeleteAll)}
			onDeleteCurrent={option => {
				void deleteConversation(String(option.value), setItems, onDelete)
			}}
			onSelect={option => {
				void onOpen(String(option.value))
			}}
			options={options}
			placeholder='Search sessions'
			title='Sessions'
		/>
	)
}

function resetConversations(
	setItems: Dispatch<SetStateAction<ConversationSummary[]>>,
	onDeleteAll: () => Promise<void>
): void {
	setItems([])
	void onDeleteAll()
}

async function deleteConversation(
	conversationId: string,
	setItems: Dispatch<SetStateAction<ConversationSummary[]>>,
	onDelete: (conversationId: string) => Promise<void>
): Promise<void> {
	setItems(current => current.filter(conversation => conversation.id !== conversationId))
	await onDelete(conversationId)
}

function isCloseSessionsKey(key: KeyboardEventLike): boolean {
	return key.ctrl === true && (key.name === 'r' || key.raw === '\u0012' || key.sequence === '\u0012')
}
