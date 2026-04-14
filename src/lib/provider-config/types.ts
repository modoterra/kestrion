export type FocusField =
	| 'providerSearch'
	| 'providerSelect'
	| 'modelSearch'
	| 'modelSelect'
	| 'maxTokens'
	| 'promptTruncateLength'
	| 'temperature'
	| 'apiKey'
	| 'apiKeyEnv'
	| 'baseUrl'

export type StepId = 'provider' | 'model' | 'limits' | 'credentials' | 'advanced'
