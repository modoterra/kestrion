import { executeFetchTool, FETCH_TOOL_DEFINITION, FETCH_TOOL_NAME } from './fetch'
import { executeQuestionTool, QUESTION_TOOL_DEFINITION, QUESTION_TOOL_NAME } from './question'
import { executeRememberTool, REMEMBER_TOOL_DEFINITION, REMEMBER_TOOL_NAME } from './remember'
import { executeSkillTool, SKILL_TOOL_DEFINITION, SKILL_TOOL_NAME } from './skill'
import { executeTodoTool, TODO_TOOL_DEFINITION, TODO_TOOL_NAME } from './todo'
import type { RegisteredTool } from './tool-types'

export const APP_TOOL_REGISTRY: RegisteredTool[] = [
	{
		definition: SKILL_TOOL_DEFINITION,
		execute: executeSkillTool,
		metadata: {
			category: 'local skill invocation',
			execution: 'local',
			restrictions: [
				'Loads skills from ~/.share/kestrion/skills only.',
				'Reads SKILL.md and optional included files.',
				'Rejects paths outside the chosen skill directory.'
			],
			scope: 'app-storage'
		},
		name: SKILL_TOOL_NAME
	},
	{
		definition: TODO_TOOL_DEFINITION,
		execute: executeTodoTool,
		metadata: {
			category: 'agent planning',
			execution: 'local',
			restrictions: [
				'Stores todos in the app data directory.',
				'Supports list, add, update, remove, and clear actions.',
				'Returns incomplete items before completed ones.'
			],
			scope: 'app-storage'
		},
		name: TODO_TOOL_NAME
	},
	{
		definition: REMEMBER_TOOL_DEFINITION,
		execute: executeRememberTool,
		metadata: {
			category: 'agent memory',
			execution: 'local',
			restrictions: [
				'Stores data in the app data directory.',
				'Supports scratch, episodic, and long-term memory.',
				'Returns the most recent entries first.'
			],
			scope: 'app-storage'
		},
		name: REMEMBER_TOOL_NAME
	},
	{
		definition: QUESTION_TOOL_DEFINITION,
		execute: executeQuestionTool,
		metadata: {
			category: 'interactive clarification',
			execution: 'local',
			restrictions: [
				'Prompts the user directly inside the TUI.',
				'Supports predefined options or free-form answers.',
				'Waits for a user response before continuing.'
			],
			scope: 'user-interaction'
		},
		name: QUESTION_TOOL_NAME
	},
	{
		definition: FETCH_TOOL_DEFINITION,
		execute: executeFetchTool,
		metadata: {
			category: 'web retrieval',
			execution: 'network',
			restrictions: [
				'Accepts absolute http:// or https:// URLs only.',
				'Returns text responses only.',
				'Truncates output to 20,000 characters by default.'
			],
			scope: 'web'
		},
		name: FETCH_TOOL_NAME
	}
]
