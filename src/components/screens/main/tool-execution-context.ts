import { createElement, useMemo } from 'react'

import type { MainScreenState } from '../../../lib/app/main-screen-state'
import type { AppProps } from '../../../lib/app/types'
import type { useViewStack } from '../../../lib/navigation/view-stack'
import type { ToolExecutionContext, ToolQuestionAnswer, ToolQuestionPrompt } from '../../../lib/tools/tool-types'
import type { ToolApprovalPrompt, ToolApprovalResponse } from '../../../lib/types'
import { QuestionScreen } from '../question/screen'

export function useToolExecutionContext(
	paths: AppProps['paths'],
	setStatus: MainScreenState['setStatus'],
	viewStack: ReturnType<typeof useViewStack>
): ToolExecutionContext {
	return useMemo<ToolExecutionContext>(
		() => ({
			appPaths: paths,
			askQuestion: (prompt): Promise<ToolQuestionAnswer> => askToolQuestion(prompt, setStatus, viewStack),
			workspaceRoot: process.cwd()
		}),
		[paths, setStatus, viewStack]
	)
}

function askToolQuestion(
	question: ToolQuestionPrompt,
	setStatus: MainScreenState['setStatus'],
	viewStack: ReturnType<typeof useViewStack>
): Promise<ToolQuestionAnswer> {
	return new Promise(resolve => {
		let settled = false
		let closeStatus = 'Question cancelled.'
		const finish = (answer: ToolQuestionAnswer): void => {
			if (settled) {
				return
			}

			settled = true
			resolve(answer)
		}

		setStatus('Waiting for your answer.')
		viewStack.push({
			element: createElement(QuestionScreen, {
				onAnswer: answer => {
					if (settled) {
						return
					}

					closeStatus = answer.source === 'freeform' ? 'Free-form answer submitted.' : 'Option selected.'
					finish(answer)
					viewStack.pop()
				},
				question
			}),
			onPop: () => {
				setStatus(closeStatus)
				finish({ answer: '', cancelled: true, source: 'cancelled' })
			}
		})
	})
}

export async function requestToolApproval(
	prompt: ToolApprovalPrompt,
	setStatus: MainScreenState['setStatus'],
	viewStack: ReturnType<typeof useViewStack>
): Promise<ToolApprovalResponse> {
	const answer = await askToolQuestion(
		{
			allowFreeform: true,
			freeformOptionValue: 'other',
			options: [
				{ label: 'Yes, this once', value: 'allowOnce' },
				{ label: 'Yes, this session', value: 'allowSession' },
				{ label: 'Yes, forever', value: 'allowForever' },
				{ label: 'No', value: 'deny' },
				{ label: 'No, and never ask again', value: 'denyForever' },
				{ label: 'Other...', value: 'other' }
			],
			placeholder: 'Explain your decision',
			prompt: `${prompt.description}\n\nRequested access: ${prompt.requestedAccess}`,
			title: `Approve ${prompt.toolName}?`
		},
		setStatus,
		viewStack
	)

	if (answer.cancelled) {
		return { mode: 'deny' }
	}

	if (answer.source === 'freeform') {
		return { explanation: answer.answer, mode: 'other' }
	}

	return { mode: answer.optionValue as ToolApprovalResponse['mode'] }
}
