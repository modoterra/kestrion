import { expect, test } from 'bun:test'

import { deserialize, discriminatedUnion, number, object, optional, serialize, string } from './schema'

const sampleSchema = object({
	items: optional(
		discriminatedUnion('type', {
			counters: object({ type: string(), values: object({ count: number({ integer: true }), label: string() }) }),
			note: object({ type: string(), values: object({ text: string() }) })
		})
	),
	name: string()
})

test('schema helper round-trips nested objects with optional fields', () => {
	const value = { items: { type: 'counters', values: { count: 3, label: 'Queued' } }, name: 'status' }

	expect(deserialize(sampleSchema, serialize(sampleSchema, value))).toEqual(value)
	expect(deserialize(sampleSchema, serialize(sampleSchema, { name: 'empty' }))).toEqual({ name: 'empty' })
})

test('schema helper reports precise field paths for validation errors', () => {
	expect(() =>
		deserialize(
			sampleSchema,
			new TextEncoder().encode(JSON.stringify({ items: { type: 'counters', values: { count: '3' } }, name: 'bad' }))
		)
	).toThrow('items.values.count')
})

test('schema helper rejects malformed UTF-8 and invalid JSON', () => {
	expect(() => deserialize(sampleSchema, Uint8Array.from([0xc3, 0x28]))).toThrow('UTF-8')
	expect(() => deserialize(sampleSchema, new TextEncoder().encode('{not json'))).toThrow('JSON')
})
