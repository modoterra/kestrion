import { expect, mock, test } from 'bun:test'

import { EXPECTED_TOOL_NAMES } from '../../test/tool-test-utils'
import { createWorkerToolRegistry } from './worker-tool-registry'

test('worker tool registry exposes the full tool list', () => {
	expect(createWorkerToolRegistry().map(tool => tool.name)).toEqual(EXPECTED_TOOL_NAMES)
})

test('worker tool registry routes hosted tools through the daemon bridge', async () => {
	const executeHostedTool = mock(
		(toolName: 'fetch' | 'question' | 'remember' | 'skill' | 'todo', argumentsJson: string) =>
			Promise.resolve(JSON.stringify({ argumentsJson, ok: true, toolName }))
	)
	const registry = createWorkerToolRegistry(executeHostedTool)
	const fetchTool = registry.find(tool => tool.name === 'fetch')
	const rememberTool = registry.find(tool => tool.name === 'remember')
	const todoTool = registry.find(tool => tool.name === 'todo')
	const skillTool = registry.find(tool => tool.name === 'skill')

	await expect(fetchTool?.execute('{"url":"https://example.com"}', {})).resolves.toBe(
		JSON.stringify({ argumentsJson: '{"url":"https://example.com"}', ok: true, toolName: 'fetch' })
	)
	await expect(rememberTool?.execute('{"memory":"scratch","action":"read"}', {})).resolves.toBe(
		JSON.stringify({ argumentsJson: '{"memory":"scratch","action":"read"}', ok: true, toolName: 'remember' })
	)
	await expect(todoTool?.execute('{"action":"list"}', {})).resolves.toBe(
		JSON.stringify({ argumentsJson: '{"action":"list"}', ok: true, toolName: 'todo' })
	)
	await expect(skillTool?.execute('{"action":"list"}', {})).resolves.toBe(
		JSON.stringify({ argumentsJson: '{"action":"list"}', ok: true, toolName: 'skill' })
	)
	expect(executeHostedTool.mock.calls).toEqual([
		['fetch', '{"url":"https://example.com"}'],
		['remember', '{"memory":"scratch","action":"read"}'],
		['todo', '{"action":"list"}'],
		['skill', '{"action":"list"}']
	])
})

test('worker tool registry keeps question denied until the daemon protocol supports it', () => {
	const questionTool = createWorkerToolRegistry().find(tool => tool.name === 'question')

	expect(questionTool?.execute('{"prompt":"Need input"}', {})).toBe(
		JSON.stringify({ error: 'Tool "question" is not yet available through the sandbox worker protocol.', ok: false })
	)
})

test('worker tool registry routes local tools through daemon authorization before execution', async () => {
	const authorizeToolCall = mock<
		(
			toolName: string,
			argumentsJson: string
		) => Promise<{ fileAccessPolicy: { defaultReadRoot: string; readRoots: string[]; writeRoots: string[] } }>
	>(() =>
		Promise.resolve({ fileAccessPolicy: { defaultReadRoot: '/agent', readRoots: ['/agent'], writeRoots: ['/agent'] } })
	)
	const registry = createWorkerToolRegistry(undefined, authorizeToolCall)
	const readTool = registry.find(tool => tool.name === 'read')

	await readTool?.execute('{"path":"notes.txt"}', {})

	expect(authorizeToolCall).toHaveBeenCalledWith('read', '{"path":"notes.txt"}')
})
