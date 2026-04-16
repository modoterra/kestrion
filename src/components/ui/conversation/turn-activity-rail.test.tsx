import { expect, test } from 'bun:test'

import { getContextUsageGlyphColor } from '../../../lib/ui/context-usage'

test('ramps context usage colors from green to red', () => {
	expect(getContextUsageGlyphColor(0)).toBe('#59d499')
	expect(getContextUsageGlyphColor(0.3)).toBe('#88d66a')
	expect(getContextUsageGlyphColor(0.5)).toBe('#d9c85f')
	expect(getContextUsageGlyphColor(0.8)).toBe('#e39b4f')
	expect(getContextUsageGlyphColor(1)).toBe('#dc6b61')
})
