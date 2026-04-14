import { expect, test } from 'bun:test'

import { executeQuestionTool } from './question'

test('asks the user a question through the execution context', async () => {
	let seenPrompt = ''

	const result = JSON.parse(
		await executeQuestionTool(
			JSON.stringify({ options: [{ label: 'Alpha', value: 'alpha' }], prompt: 'Pick a mode' }),
			{
				askQuestion: prompt => {
					seenPrompt = prompt.prompt
					return Promise.resolve({ answer: 'alpha', optionLabel: 'Alpha', optionValue: 'alpha', source: 'option' })
				}
			}
		)
	) as { answer: { answer: string; optionValue: string }; ok: boolean }

	expect(seenPrompt).toBe('Pick a mode')
	expect(result.ok).toBe(true)
	expect(result.answer.answer).toBe('alpha')
	expect(result.answer.optionValue).toBe('alpha')
})
