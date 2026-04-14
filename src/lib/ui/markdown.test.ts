import { expect, test } from 'bun:test'

import { createAgentMessageMarkdownTreeSitterClient } from './markdown'

test('loads markdown highlights through the patched tree-sitter worker', async () => {
	const client = createAgentMessageMarkdownTreeSitterClient()

	try {
		const result = await client.highlightOnce('## Ship Plan\n\n- Verify the fix\n', 'markdown')

		expect(result.error).toBeUndefined()
		expect(result.highlights?.length ?? 0).toBeGreaterThan(0)
	} finally {
		await client.destroy()
	}
})
