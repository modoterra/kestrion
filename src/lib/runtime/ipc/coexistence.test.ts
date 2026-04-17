import { expect, test } from 'bun:test'

import { decodeDaemonRequest, encodeDaemonRequest } from './daemon-codec'
import { decodeWorkerEnvelope, encodeWorkerEnvelope, type WorkerWireEnvelope } from './worker-codec'

test('daemon and worker codecs can be used in the same process', () => {
	const daemonRequest = { id: 'bootstrap-1', type: 'bootstrap' } as const
	const workerEnvelope: WorkerWireEnvelope = {
		messageId: 'worker-bootstrap-1',
		payload: {
			conversationId: 'conversation-1',
			defaultReadRoot: '/agent',
			readRoots: ['/agent', '/config'],
			turnId: 'turn-1',
			writeRoots: ['/agent']
		},
		type: 'sessionBootstrap'
	}

	expect(decodeDaemonRequest(encodeDaemonRequest(daemonRequest))).toEqual(daemonRequest)
	expect(decodeWorkerEnvelope(encodeWorkerEnvelope(workerEnvelope))).toEqual(workerEnvelope)
	expect(decodeDaemonRequest(encodeDaemonRequest(daemonRequest))).toEqual(daemonRequest)
})
