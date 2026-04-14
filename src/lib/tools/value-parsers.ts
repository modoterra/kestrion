export function parseOptionalBooleanField(value: unknown, fieldName: string): boolean | undefined {
	if (value === undefined) {
		return undefined
	}

	if (typeof value !== 'boolean') {
		throw new TypeError(`${fieldName} must be a boolean when provided.`)
	}

	return value
}

export function parseOptionalStringField(value: unknown, fieldName: string): string | undefined {
	if (value === undefined) {
		return undefined
	}

	if (typeof value !== 'string') {
		throw new TypeError(`${fieldName} must be a string when provided.`)
	}

	return value
}
