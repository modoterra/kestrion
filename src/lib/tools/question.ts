import { getErrorMessage, isRecord } from './common'
import type { ToolExecutionContext, ToolQuestionAnswer, ToolQuestionOption, ToolQuestionPrompt } from './tool-types'

export const QUESTION_TOOL_NAME = 'question'

export const QUESTION_TOOL_DEFINITION = {
	function: {
		description: 'Ask the user a clarifying question with optional predefined choices or free-form input.',
		name: QUESTION_TOOL_NAME,
		parameters: {
			additionalProperties: false,
			properties: {
				allowFreeform: { description: 'Allow the user to type a custom answer.', type: 'boolean' },
				options: {
					description: 'Optional predefined answer choices.',
					items: {
						properties: {
							description: { description: 'Optional explanation shown with the choice.', type: 'string' },
							label: { description: 'Choice label shown to the user.', type: 'string' },
							value: { description: 'Value returned when the user chooses this option.', type: 'string' }
						},
						required: ['label', 'value'],
						type: 'object'
					},
					type: 'array'
				},
				placeholder: { description: 'Optional placeholder for free-form answers.', type: 'string' },
				prompt: { description: 'Question to ask the user.', type: 'string' },
				title: { description: 'Optional short title for the question.', type: 'string' }
			},
			required: ['prompt'],
			type: 'object'
		},
		strict: true
	},
	type: 'function'
} as const

type QuestionArguments = ToolQuestionPrompt
type QuestionErrorResult = { error: string; ok: false }
type QuestionSuccessResult = { answer: ToolQuestionAnswer; ok: true }

export type QuestionResult = QuestionErrorResult | QuestionSuccessResult

export async function executeQuestionTool(argumentsJson: string, options: ToolExecutionContext = {}): Promise<string> {
	try {
		const parsedArguments = JSON.parse(argumentsJson) as unknown
		return JSON.stringify(await askUserQuestion(parsedArguments, options))
	} catch (error) {
		return JSON.stringify({
			error: `Invalid question arguments: ${getErrorMessage(error)}`,
			ok: false
		} satisfies QuestionErrorResult)
	}
}

export async function askUserQuestion(input: unknown, options: ToolExecutionContext = {}): Promise<QuestionResult> {
	try {
		if (!options.askQuestion) {
			throw new Error('Question prompts are not available in this context.')
		}

		const question = parseQuestionArguments(input)
		return { answer: await options.askQuestion(question), ok: true }
	} catch (error) {
		return { error: getErrorMessage(error), ok: false }
	}
}

function parseQuestionArguments(input: unknown): QuestionArguments {
	if (!isRecord(input)) {
		throw new Error('Arguments must be a JSON object.')
	}

	const prompt = input.prompt
	if (typeof prompt !== 'string' || !prompt.trim()) {
		throw new Error('prompt must be a non-empty string.')
	}

	const title = input.title
	if (title !== undefined && (typeof title !== 'string' || !title.trim())) {
		throw new Error('title must be a non-empty string when provided.')
	}

	const placeholder = input.placeholder
	if (placeholder !== undefined && typeof placeholder !== 'string') {
		throw new Error('placeholder must be a string when provided.')
	}

	const allowFreeform = input.allowFreeform
	if (allowFreeform !== undefined && typeof allowFreeform !== 'boolean') {
		throw new Error('allowFreeform must be a boolean when provided.')
	}

	const options = input.options
	if (options !== undefined && (!Array.isArray(options) || options.length === 0)) {
		throw new Error('options must be a non-empty array when provided.')
	}

	const parsedOptions = options?.map((option, index) => parseQuestionOption(option, index))
	if (!allowFreeform && (!parsedOptions || parsedOptions.length === 0)) {
		throw new Error('Provide options or set allowFreeform to true.')
	}

	return {
		allowFreeform,
		options: parsedOptions,
		placeholder,
		prompt: prompt.trim(),
		title: typeof title === 'string' ? title.trim() : undefined
	}
}

function parseQuestionOption(option: unknown, index: number): ToolQuestionOption {
	if (!isRecord(option)) {
		throw new Error(`options[${index}] must be an object.`)
	}

	const label = option.label
	if (typeof label !== 'string' || !label.trim()) {
		throw new Error(`options[${index}].label must be a non-empty string.`)
	}

	const value = option.value
	if (typeof value !== 'string' || !value.trim()) {
		throw new Error(`options[${index}].value must be a non-empty string.`)
	}

	const description = option.description
	if (description !== undefined && typeof description !== 'string') {
		throw new Error(`options[${index}].description must be a string when provided.`)
	}

	return { description, label: label.trim(), value: value.trim() }
}
