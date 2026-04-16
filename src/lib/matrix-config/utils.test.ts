import { expect, test } from 'bun:test'

import { DEFAULT_MATRIX_DRAFT } from './fields'
import { generateMatrixMarkdown } from './utils'

test('generateMatrixMarkdown builds the required MATRIX sections from the draft', () => {
	const markdown = generateMatrixMarkdown(DEFAULT_MATRIX_DRAFT)

	expect(markdown).toContain('# MATRIX')
	expect(markdown).toContain('## Role')
	expect(markdown).toContain('## Personality And Tone')
	expect(markdown).toContain('## Autonomy And Initiative')
	expect(markdown).toContain('## Planning And Escalation')
	expect(markdown).toContain('## Engineering Standards')
	expect(markdown).toContain('## Risk And Safety')
	expect(markdown).toContain('## Output Style')
	expect(markdown).toContain('## Additional Instructions')
	expect(markdown).toContain('No extra instructions have been added yet.')
})

test('generateMatrixMarkdown appends custom instructions verbatim when present', () => {
	const markdown = generateMatrixMarkdown({
		...DEFAULT_MATRIX_DRAFT,
		customInstructions: 'Prefer concrete examples.\nKeep explanations grounded in the repo.'
	})

	expect(markdown).toContain('## Additional Instructions')
	expect(markdown).toContain('Prefer concrete examples.\nKeep explanations grounded in the repo.')
	expect(markdown).not.toContain('No extra instructions have been added yet.')
})
