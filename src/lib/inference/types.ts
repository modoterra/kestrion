import type { InferenceRequest, InferenceResult } from '../types'

export interface InferenceAdapter {
	readonly id: string
	readonly label: string

	complete(request: InferenceRequest): Promise<InferenceResult>
}
