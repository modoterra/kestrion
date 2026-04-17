import { expect, test } from 'bun:test'

import { decodeWorkerEnvelope, encodeWorkerEnvelope, type WorkerWireEnvelope } from './worker-codec'

test('worker codec round-trips session bootstrap and tool responses', () => {
	const bootstrapEnvelope: WorkerWireEnvelope = {
		messageId: 'turn-1:bootstrap',
		payload: {
			conversationId: 'conversation-1',
			defaultReadRoot: '/agent',
			readRoots: ['/agent', '/config'],
			turnId: 'turn-1',
			writeRoots: ['/agent']
		},
		type: 'sessionBootstrap'
	}

	const responseEnvelope: WorkerWireEnvelope = {
		messageId: 'request-1',
		payload: {
			audits: [],
			mutations: [],
			ok: true,
			requestId: 'request-1',
			result: 'done',
			telemetry: { durationMs: 12 }
		},
		type: 'executeToolResponse'
	}

	expect(decodeWorkerEnvelope(encodeWorkerEnvelope(bootstrapEnvelope))).toEqual(bootstrapEnvelope)
	expect(decodeWorkerEnvelope(encodeWorkerEnvelope(responseEnvelope))).toEqual(responseEnvelope)
})

test('worker codec rejects wrong protocol', () => {
	expect(() =>
		decodeWorkerEnvelope(
			new TextEncoder().encode(
				JSON.stringify({
					messageId: 'turn-1:bootstrap',
					payload: {
						payload: {
							conversationId: 'conversation-1',
							defaultReadRoot: '/agent',
							readRoots: ['/agent'],
							turnId: 'turn-1',
							writeRoots: ['/agent']
						},
						type: 'sessionBootstrap'
					},
					protocol: 'wrong-protocol',
					version: 1
				})
			)
		)
	).toThrow('protocol')
})
