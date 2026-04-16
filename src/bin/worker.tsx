import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { runAgentTurn } from '../lib/runtime/worker/run-agent-turn'
import type {
	WorkerHostToolResponse,
	WorkerStdoutMessage,
	WorkerToolAuthorizationResponse,
	WorkerTurnInput
} from '../lib/runtime/worker/types'

const inputJson = loadWorkerTurnInput()

if (!inputJson.trim()) {
	throw new Error('Worker turn input is required.')
}

const input = JSON.parse(inputJson) as WorkerTurnInput
const hostBridge = createHostBridge()

try {
	await runAgentTurn(
		input,
		event => {
			writeWorkerMessage({ event, type: 'event' })
		},
		undefined,
		(toolName, argumentsJson) => hostBridge.authorize(toolName, argumentsJson),
		(toolName, argumentsJson) => hostBridge.request(toolName, argumentsJson)
	)
} catch (error) {
	process.stderr.write(`${getWorkerErrorMessage(error)}\n`)
	process.exitCode = 1
}

function loadWorkerTurnInput(): string {
	const inputFile = process.env.KESTRION_WORKER_TURN_INPUT_FILE?.trim()
	return inputFile ? readFileSync(inputFile, 'utf8') : readFileSync(0, 'utf8')
}

function getWorkerErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : 'Unknown worker error.'
}

function writeWorkerMessage(message: WorkerStdoutMessage): void {
	process.stdout.write(`${JSON.stringify(message)}\n`)
}

function createHostBridge(): {
	authorize: NonNullable<Parameters<typeof runAgentTurn>[3]>
	request: NonNullable<Parameters<typeof runAgentTurn>[4]>
} {
	const turnInputFile = process.env.KESTRION_WORKER_TURN_INPUT_FILE?.trim()
	const hostResponseDirectory = turnInputFile ? join(dirname(turnInputFile), 'host-responses') : null

	return {
		authorize: async (toolName, argumentsJson) => {
			if (!hostResponseDirectory) {
				throw new Error('Worker host response directory is not configured.')
			}

			const requestId = randomUUID()
			writeWorkerMessage({ argumentsJson, requestId, toolName, type: 'toolAuthorizationRequest' })
			const response = await waitForHostResponse<WorkerToolAuthorizationResponse>(
				join(hostResponseDirectory, `${requestId}.json`)
			)

			if (response.type === 'toolAuthorizationDeny') {
				throw new Error(response.error)
			}

			return response.context
		},
		request: async (toolName, argumentsJson) => {
			if (!hostResponseDirectory) {
				throw new Error('Worker host response directory is not configured.')
			}

			const requestId = randomUUID()
			writeWorkerMessage({ argumentsJson, requestId, toolName, type: 'hostToolRequest' })
			const response = await waitForHostResponse<WorkerHostToolResponse>(
				join(hostResponseDirectory, `${requestId}.json`)
			)

			if (response.type === 'hostToolError') {
				throw new Error(response.error)
			}

			return response.result
		}
	}
}

async function waitForHostResponse<TResponse extends WorkerHostToolResponse | WorkerToolAuthorizationResponse>(
	responseFile: string
): Promise<TResponse> {
	if (existsSync(responseFile)) {
		return JSON.parse(readFileSync(responseFile, 'utf8')) as TResponse
	}

	await waitForDelay(10)
	return waitForHostResponse(responseFile)
}

function waitForDelay(delayMs: number): Promise<void> {
	return new Promise(resolve => {
		setTimeout(resolve, delayMs)
	})
}
