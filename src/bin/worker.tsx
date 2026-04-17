import { encodeFramedMessage, FramedMessageReader } from '../lib/runtime/ipc/framing'
import { decodeWorkerEnvelope, encodeWorkerEnvelope, type WorkerWireEnvelope } from '../lib/runtime/ipc/worker-codec'
import { createErroredToolAuditRecord, createToolInvocationAuditRecord } from '../lib/tools/audit'
import type { ToolInvocationAuditRecord, ToolMutationRecord } from '../lib/tools/tool-types'
import type { ToolExecutionContext } from '../lib/tools/tool-types'
import { WORKSPACE_TOOL_REGISTRY } from '../lib/tools/workspace-tool-registry'

const workerState = {
	bootstrap: null as null | {
		conversationId: string
		defaultReadRoot: string
		readRoots: string[]
		turnId: string
		writeRoots: string[]
	}
}

const reader = new FramedMessageReader()

process.stdin.on('data', chunk => {
	reader.push(chunk as Buffer, payload => {
		void handleEnvelope(decodeWorkerEnvelope(payload))
	})
})

async function handleEnvelope(envelope: WorkerWireEnvelope): Promise<void> {
	try {
		switch (envelope.type) {
			case 'sessionBootstrap':
				workerState.bootstrap = envelope.payload
				return
			case 'executeToolRequest':
				await executeToolRequest(envelope)
				return
			case 'shutdown':
				process.exitCode = 0
				process.stdin.pause()
				return
			case 'executeToolResponse':
			case 'executionError':
			case 'executionEvent':
				throw new Error(`Worker received invalid inbound message "${envelope.type}".`)
		}
	} catch (error) {
		writeEnvelope({
			messageId: envelope.messageId,
			payload: {
				error: error instanceof Error ? error.message : 'Unknown worker error.',
				requestId: envelope.type === 'executeToolRequest' ? envelope.payload.requestId : envelope.messageId
			},
			type: 'executionError'
		})
	}
}

async function executeToolRequest(
	envelope: Extract<WorkerWireEnvelope, { type: 'executeToolRequest' }>
): Promise<void> {
	const bootstrap = workerState.bootstrap
	if (!bootstrap) {
		throw new Error('Worker session bootstrap has not been received.')
	}

	const tool = WORKSPACE_TOOL_REGISTRY.find(candidate => candidate.name === envelope.payload.toolName)
	if (!tool) {
		throw new Error(`Unknown worker tool "${envelope.payload.toolName}".`)
	}

	writeEnvelope({
		messageId: `${envelope.messageId}:started`,
		payload: { requestId: envelope.payload.requestId, toolName: envelope.payload.toolName, type: 'toolStarted' },
		type: 'executionEvent'
	})

	const audits: ToolInvocationAuditRecord[] = []
	const mutations: ToolMutationRecord[] = []
	const startedAt = Date.now()

	try {
		const result = await tool.execute(envelope.payload.argumentsJson, {
			allowedMemoryKinds: envelope.payload.authorization.allowedMemoryKinds,
			allowedSkillNames: envelope.payload.authorization.allowedSkillNames,
			fileAccessPolicy: envelope.payload.authorization.fileAccessPolicy ?? {
				defaultReadRoot: bootstrap.defaultReadRoot,
				readRoots: bootstrap.readRoots,
				writeRoots: bootstrap.writeRoots
			},
			networkAccessPolicy: envelope.payload.authorization.networkAccessPolicy,
			onAuditRecord: audit => {
				audits.push(audit)
			},
			onMutation: mutation => {
				mutations.push(mutation)
			},
			todoAllowed: envelope.payload.authorization.todoAllowed,
			toolRegistry: WORKSPACE_TOOL_REGISTRY,
			workspaceRoot: bootstrap.defaultReadRoot
		})

		writeEnvelope({
			messageId: envelope.messageId,
			payload: {
				audits: [
					...audits,
					createToolInvocationAuditRecord(
						envelope.payload.toolName,
						envelope.payload.argumentsJson,
						result,
						Date.now() - startedAt
					)
				],
				mutations,
				ok: true,
				requestId: envelope.payload.requestId,
				result,
				telemetry: { durationMs: Date.now() - startedAt }
			},
			type: 'executeToolResponse'
		})
	} catch (error) {
		writeEnvelope({
			messageId: envelope.messageId,
			payload: {
				audits: [
					...audits,
					createErroredToolAuditRecord(
						envelope.payload.toolName,
						envelope.payload.argumentsJson,
						error instanceof Error ? error.message : 'Unknown worker tool error.',
						Date.now() - startedAt
					)
				],
				error: error instanceof Error ? error.message : 'Unknown worker tool error.',
				mutations,
				ok: false,
				requestId: envelope.payload.requestId,
				telemetry: { durationMs: Date.now() - startedAt }
			},
			type: 'executeToolResponse'
		})
	} finally {
		writeEnvelope({
			messageId: `${envelope.messageId}:completed`,
			payload: { requestId: envelope.payload.requestId, toolName: envelope.payload.toolName, type: 'toolCompleted' },
			type: 'executionEvent'
		})
	}
}

function writeEnvelope(envelope: WorkerWireEnvelope): void {
	process.stdout.write(encodeFramedMessage(encodeWorkerEnvelope(envelope)))
}
