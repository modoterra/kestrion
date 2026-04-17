import { expect, test } from 'bun:test'

import { decodeDaemonRequest, decodeDaemonResponse, encodeDaemonRequest, encodeDaemonResponse } from '../ipc/daemon-codec'

test('round-trips compactConversation daemon requests through the IPC codec', () => {
	const encoded = encodeDaemonRequest({
		conversationId: 'conversation-123',
		id: 'request-1',
		type: 'compactConversation'
	})

	expect(decodeDaemonRequest(encoded)).toEqual({
		conversationId: 'conversation-123',
		id: 'request-1',
		type: 'compactConversation'
	})
})

test('round-trips compactConversation daemon responses through the IPC codec', () => {
	const encoded = encodeDaemonResponse({
		id: 'request-1',
		ok: true,
		result: {
			compacted: true,
			conversationId: 'conversation-123',
			reason: 'updated'
		},
		type: 'response'
	})

	expect(decodeDaemonResponse(encoded)).toEqual({
		id: 'request-1',
		ok: true,
		result: {
			compacted: true,
			conversationId: 'conversation-123',
			reason: 'updated'
		},
		type: 'response'
	})
})
