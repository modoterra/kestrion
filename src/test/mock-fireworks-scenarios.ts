import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const TEST_FIREWORKS_SCENARIO_FILE_ENV = 'KESTRION_TEST_FIREWORKS_SCENARIO_FILE'

type MockFireworksScenarioEvent = { data: '[DONE]' | Record<string, unknown>; delayMs?: number }

export type MockFireworksScenarioResponse =
	| { body: Record<string, unknown>; kind: 'json'; status?: number }
	| { events: MockFireworksScenarioEvent[]; kind: 'stream'; status?: number }

let activeScenarioDirectory: string | null = null
let activeScenarioFile: string | null = null

export function mockFireworksScenarioResponses(responses: MockFireworksScenarioResponse[]): void {
	clearMockFireworksScenarioResponses()
	const scenarioDirectory = mkdtempSync(join(tmpdir(), 'kestrion-fireworks-scenario-'))
	const scenarioFile = join(scenarioDirectory, 'scenario.json')
	writeFileSync(scenarioFile, JSON.stringify({ requests: [], responses }), 'utf8')
	process.env[TEST_FIREWORKS_SCENARIO_FILE_ENV] = scenarioFile
	activeScenarioDirectory = scenarioDirectory
	activeScenarioFile = scenarioFile
}

export function clearMockFireworksScenarioResponses(): void {
	delete process.env[TEST_FIREWORKS_SCENARIO_FILE_ENV]

	if (!activeScenarioDirectory) {
		return
	}

	rmSync(activeScenarioDirectory, { force: true, recursive: true })
	activeScenarioDirectory = null
	activeScenarioFile = null
}

export function readMockFireworksScenarioRequests(): string[] {
	if (!activeScenarioFile) {
		return []
	}

	const state = JSON.parse(readFileSync(activeScenarioFile, 'utf8')) as { requests?: string[] }
	return state.requests ?? []
}
