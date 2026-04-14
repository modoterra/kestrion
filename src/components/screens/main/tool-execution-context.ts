import { createElement, useMemo } from 'react'

import type { MainScreenState } from '../../../lib/app/main-screen-state'
import type { AppProps } from '../../../lib/app/types'
import type { useViewStack } from '../../../lib/navigation/view-stack'
import type { ToolExecutionContext, ToolQuestionAnswer, ToolQuestionPrompt } from '../../../lib/tools/tool-types'
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
