import { array, deserialize, discriminatedUnion, literal, object, serialize, string, type Schema } from './schema'
import {
	workerExecutionErrorSchema,
	workerExecutionEventSchema,
	workerShutdownSchema,
	workerToolExecutionRequestSchema,
	workerToolExecutionResponseSchema
} from './shared-schemas'

const PROTOCOL = 'kestrion-worker-v1'
const VERSION = 1

export type WorkerWireSessionBootstrap = {
	conversationId: string
	defaultReadRoot: string
	readRoots: string[]
	turnId: string
	writeRoots: string[]
}

export type WorkerWireExecuteToolRequest = import('../worker/types').WorkerToolExecutionRequest
export type WorkerWireExecuteToolResponse = import('../worker/types').WorkerToolExecutionResponse
export type WorkerWireExecutionEvent = import('../worker/types').WorkerExecutionEvent
export type WorkerWireExecutionError = { error: string; requestId: string }
export type WorkerWireShutdown = { reason?: string }
export type WorkerWireEnvelope =
	| { messageId: string; payload: WorkerWireSessionBootstrap; type: 'sessionBootstrap' }
	| { messageId: string; payload: WorkerWireExecuteToolRequest; type: 'executeToolRequest' }
	| { messageId: string; payload: WorkerWireExecuteToolResponse; type: 'executeToolResponse' }
	| { messageId: string; payload: WorkerWireExecutionEvent; type: 'executionEvent' }
	| { messageId: string; payload: WorkerWireExecutionError; type: 'executionError' }
	| { messageId: string; payload: WorkerWireShutdown; type: 'shutdown' }

type WorkerEnvelopePayload =
	| { payload: WorkerWireSessionBootstrap; type: 'sessionBootstrap' }
	| { payload: WorkerWireExecuteToolRequest; type: 'executeToolRequest' }
	| { payload: WorkerWireExecuteToolResponse; type: 'executeToolResponse' }
	| { payload: WorkerWireExecutionEvent; type: 'executionEvent' }
	| { payload: WorkerWireExecutionError; type: 'executionError' }
	| { payload: WorkerWireShutdown; type: 'shutdown' }

type WorkerEnvelope = {
	messageId: string
	payload: WorkerEnvelopePayload
	protocol: typeof PROTOCOL
	version: typeof VERSION
}

const workerSessionBootstrapSchema: Schema<WorkerWireSessionBootstrap> = object({
	conversationId: string(),
	defaultReadRoot: string(),
	readRoots: array(string()),
	turnId: string(),
	writeRoots: array(string())
})

const workerEnvelopePayloadSchema: Schema<WorkerEnvelopePayload> = discriminatedUnion('type', {
	executeToolRequest: object({ payload: workerToolExecutionRequestSchema, type: literal('executeToolRequest') }),
	executeToolResponse: object({ payload: workerToolExecutionResponseSchema, type: literal('executeToolResponse') }),
	executionError: object({ payload: workerExecutionErrorSchema, type: literal('executionError') }),
	executionEvent: object({ payload: workerExecutionEventSchema, type: literal('executionEvent') }),
	sessionBootstrap: object({ payload: workerSessionBootstrapSchema, type: literal('sessionBootstrap') }),
	shutdown: object({ payload: workerShutdownSchema, type: literal('shutdown') })
})

const workerEnvelopeSchema: Schema<WorkerEnvelope> = object({
	messageId: string(),
	payload: workerEnvelopePayloadSchema,
	protocol: literal(PROTOCOL),
	version: literal(VERSION)
})

export function encodeWorkerEnvelope(message: WorkerWireEnvelope): Uint8Array {
	return serialize(workerEnvelopeSchema, {
		messageId: message.messageId,
		payload: { payload: message.payload, type: message.type },
		protocol: PROTOCOL,
		version: VERSION
	})
}

export function decodeWorkerEnvelope(message: Uint8Array): WorkerWireEnvelope {
	const envelope = deserialize(workerEnvelopeSchema, message)
	switch (envelope.payload.type) {
		case 'sessionBootstrap':
			return { messageId: envelope.messageId, payload: envelope.payload.payload, type: 'sessionBootstrap' }
		case 'executeToolRequest':
			return { messageId: envelope.messageId, payload: envelope.payload.payload, type: 'executeToolRequest' }
		case 'executeToolResponse':
			return { messageId: envelope.messageId, payload: envelope.payload.payload, type: 'executeToolResponse' }
		case 'executionEvent':
			return { messageId: envelope.messageId, payload: envelope.payload.payload, type: 'executionEvent' }
		case 'executionError':
			return { messageId: envelope.messageId, payload: envelope.payload.payload, type: 'executionError' }
		case 'shutdown':
			return { messageId: envelope.messageId, payload: envelope.payload.payload, type: 'shutdown' }
	}
}
