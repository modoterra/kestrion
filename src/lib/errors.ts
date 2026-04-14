export function toErrorMessage(cause: unknown): string {
	if (cause instanceof Error) {
		return cause.message
	}

	return 'The provider request failed.'
}
