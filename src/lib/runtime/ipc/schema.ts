type PathSegment = number | string

export type Schema<T> = { optional?: true; parse: (value: unknown, path?: PathSegment[]) => T }

type ObjectShape = Record<string, Schema<any>>
type OptionalSchema<T> = Schema<T | undefined> & { optional: true }
type InferSchema<S extends Schema<unknown>> = S extends Schema<infer T> ? T : never
type OptionalKeys<TShape extends ObjectShape> = {
	[TKey in keyof TShape]: TShape[TKey] extends { optional: true } ? TKey : never
}[keyof TShape]
type RequiredKeys<TShape extends ObjectShape> = Exclude<keyof TShape, OptionalKeys<TShape>>
type ObjectSchemaValue<TShape extends ObjectShape> = {
	[TKey in RequiredKeys<TShape>]: InferSchema<TShape[TKey]>
} & {
	[TKey in OptionalKeys<TShape>]?: Exclude<InferSchema<TShape[TKey]>, undefined>
}

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder('utf-8', { fatal: true })

export class SchemaValidationError extends Error {
	constructor(
		readonly path: PathSegment[],
		message: string
	) {
		super(`Invalid value at ${formatPath(path)}: ${message}`)
		this.name = 'SchemaValidationError'
	}
}

export function serialize<T>(schema: Schema<T>, value: T): Uint8Array {
	const parsed = validate(schema, value)
	return textEncoder.encode(JSON.stringify(parsed))
}

export function deserialize<T>(schema: Schema<T>, bytes: Uint8Array): T {
	let json: string
	try {
		json = textDecoder.decode(bytes)
	} catch (error) {
		throw new Error(`Failed to decode IPC message as UTF-8: ${error instanceof Error ? error.message : String(error)}`)
	}

	let parsed: unknown
	try {
		parsed = JSON.parse(json) as unknown
	} catch (error) {
		throw new Error(`Failed to parse IPC message as JSON: ${error instanceof Error ? error.message : String(error)}`)
	}

	return validate(schema, parsed)
}

export function validate<T>(schema: Schema<T>, value: unknown): T {
	return schema.parse(value, [])
}

export function string(): Schema<string> {
	return createSchema((value, path) => {
		if (typeof value !== 'string') {
			throw invalid(path, 'expected string')
		}

		return value
	})
}

export function number(options: { integer?: boolean } = {}): Schema<number> {
	return createSchema((value, path) => {
		if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
			throw invalid(path, 'expected finite number')
		}

		if (options.integer && !Number.isInteger(value)) {
			throw invalid(path, 'expected integer')
		}

		return value
	})
}

export function boolean(): Schema<boolean> {
	return createSchema((value, path) => {
		if (typeof value !== 'boolean') {
			throw invalid(path, 'expected boolean')
		}

		return value
	})
}

export function literal<const TLiteral extends boolean | null | number | string>(expected: TLiteral): Schema<TLiteral> {
	return createSchema((value, path) => {
		if (value !== expected) {
			throw invalid(path, `expected literal ${JSON.stringify(expected)}`)
		}

		return expected
	})
}

export function enumLike<const TValue extends readonly string[]>(values: TValue): Schema<TValue[number]> {
	const allowedValues = new Set(values)
	return createSchema((value, path) => {
		if (typeof value !== 'string' || !allowedValues.has(value)) {
			throw invalid(path, `expected one of ${values.map(entry => JSON.stringify(entry)).join(', ')}`)
		}

		return value as TValue[number]
	})
}

export function array<T>(itemSchema: Schema<T>): Schema<T[]> {
	return createSchema((value, path) => {
		if (!Array.isArray(value)) {
			throw invalid(path, 'expected array')
		}

		return value.map((entry, index) => itemSchema.parse(entry, [...path, index]))
	})
}

export function optional<T>(schema: Schema<T>): OptionalSchema<T> {
	return {
		optional: true,
		parse: (value, path = []) => {
			if (value === undefined) {
				return undefined
			}

			return schema.parse(value, path)
		}
	}
}

export function nullable<T>(schema: Schema<T>): Schema<T | null> {
	return createSchema((value, path) => {
		if (value === null) {
			return null
		}

		return schema.parse(value, path)
	})
}

export function object<TShape extends ObjectShape>(shape: TShape): Schema<ObjectSchemaValue<TShape>> {
	return createSchema((value, path) => {
		if (!isPlainObject(value)) {
			throw invalid(path, 'expected object')
		}

		const input = value as Record<string, unknown>
		for (const key of Object.keys(input)) {
			if (!(key in shape)) {
				throw invalid([...path, key], 'unexpected field')
			}
		}

		const result: Record<string, unknown> = {}
		for (const [key, fieldSchema] of Object.entries(shape)) {
			const fieldValue = input[key]
			if (fieldValue === undefined && !(key in input)) {
				if (fieldSchema.optional) {
					continue
				}

				throw invalid([...path, key], 'is required')
			}

			const parsedValue = fieldSchema.parse(fieldValue, [...path, key])
			if (parsedValue !== undefined) {
				result[key] = parsedValue
			}
		}

		return result as ObjectSchemaValue<TShape>
	})
}

export function recordOf<T>(valueSchema: Schema<T>): Schema<Record<string, T>> {
	return createSchema((value, path) => {
		if (!isPlainObject(value)) {
			throw invalid(path, 'expected object')
		}

		const result: Record<string, T> = {}
		for (const [key, entryValue] of Object.entries(value)) {
			result[key] = valueSchema.parse(entryValue, [...path, key])
		}

		return result
	})
}

export function discriminatedUnion<TKey extends string, TMembers extends Record<string, Schema<unknown>>>(
	discriminant: TKey,
	members: TMembers
): Schema<InferSchema<TMembers[keyof TMembers]>> {
	return createSchema((value, path) => {
		if (!isPlainObject(value)) {
			throw invalid(path, 'expected object')
		}

		const input = value as Record<string, unknown>
		const memberKey = input[discriminant]
		if (typeof memberKey !== 'string') {
			throw invalid([...path, discriminant], 'expected discriminant string')
		}

		const memberSchema = members[memberKey]
		if (!memberSchema) {
			throw invalid([...path, discriminant], `unexpected discriminant ${JSON.stringify(memberKey)}`)
		}

		return memberSchema.parse(value, path) as InferSchema<TMembers[keyof TMembers]>
	})
}

export function lazy<T>(create: () => Schema<T>): Schema<T> {
	let cached: Schema<T> | null = null

	return createSchema((value, path) => {
		cached ??= create()
		return cached.parse(value, path)
	})
}

export function jsonValue(): Schema<unknown> {
	return createSchema((value, path) => parseJsonValue(value, path))
}

function createSchema<T>(parse: (value: unknown, path: PathSegment[]) => T): Schema<T> {
	return { parse: (value, path = []) => parse(value, path) }
}

function parseJsonValue(value: unknown, path: PathSegment[]): unknown {
	if (value === null) {
		return null
	}

	if (typeof value === 'boolean' || typeof value === 'string') {
		return value
	}

	if (typeof value === 'number') {
		if (Number.isNaN(value) || !Number.isFinite(value)) {
			throw invalid(path, 'expected JSON-safe finite number')
		}

		return value
	}

	if (Array.isArray(value)) {
		return value.map((entry, index) => parseJsonValue(entry, [...path, index]))
	}

	if (!isPlainObject(value)) {
		throw invalid(path, 'expected JSON value')
	}

	const result: Record<string, unknown> = {}
	for (const [key, entryValue] of Object.entries(value)) {
		result[key] = parseJsonValue(entryValue, [...path, key])
	}

	return result
}

function formatPath(path: PathSegment[]): string {
	if (path.length === 0) {
		return '(root)'
	}

	return path.reduce<string>((result, segment) => {
		if (typeof segment === 'number') {
			return `${result}[${segment}]`
		}

		return result ? `${result}.${segment}` : segment
	}, '')
}

function invalid(path: PathSegment[], message: string): SchemaValidationError {
	return new SchemaValidationError(path, message)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return false
	}

	const prototype = Object.getPrototypeOf(value)
	return prototype === Object.prototype || prototype === null
}
