import { executeBashTool, BASH_TOOL_DEFINITION, BASH_TOOL_NAME } from './bash'
import { executeEditTool, EDIT_TOOL_DEFINITION, EDIT_TOOL_NAME } from './edit'
import { executeGlobTool, GLOB_TOOL_DEFINITION, GLOB_TOOL_NAME } from './glob'
import { executeGrepTool, GREP_TOOL_DEFINITION, GREP_TOOL_NAME } from './grep'
import { executeListTool, LIST_TOOL_DEFINITION, LIST_TOOL_NAME } from './list'
import { executePatchTool, PATCH_TOOL_DEFINITION, PATCH_TOOL_NAME } from './patch'
import { executeReadTool, READ_TOOL_DEFINITION, READ_TOOL_NAME } from './read'
import { executeSearchTool, SEARCH_TOOL_DEFINITION, SEARCH_TOOL_NAME } from './search'
import type { RegisteredTool } from './tool-types'
import { executeWriteTool, WRITE_TOOL_DEFINITION, WRITE_TOOL_NAME } from './write'

export const WORKSPACE_TOOL_REGISTRY: RegisteredTool[] = [
	{
		definition: BASH_TOOL_DEFINITION,
		execute: executeBashTool,
		metadata: {
			category: 'workspace command execution',
			execution: 'local',
			restrictions: [
				'Runs inside the current workspace only.',
				'Captures stdout and stderr with a timeout.',
				'Returns truncated output when commands are noisy.'
			],
			scope: 'workspace-only'
		},
		name: BASH_TOOL_NAME
	},
	{
		definition: READ_TOOL_DEFINITION,
		execute: executeReadTool,
		metadata: {
			category: 'workspace file access',
			execution: 'local',
			restrictions: [
				'Reads UTF-8 text files inside the current workspace only.',
				'Rejects files outside the workspace root and binary files.',
				'Returns at most 200 lines and 24,000 characters.'
			],
			scope: 'workspace-only'
		},
		name: READ_TOOL_NAME
	},
	{
		definition: LIST_TOOL_DEFINITION,
		execute: executeListTool,
		metadata: {
			category: 'workspace directory listing',
			execution: 'local',
			restrictions: [
				'Lists files or directories inside the current workspace only.',
				'Can be limited to files or directories only.',
				'Returns up to 80 entries by default.'
			],
			scope: 'workspace-only'
		},
		name: LIST_TOOL_NAME
	},
	{
		definition: GLOB_TOOL_DEFINITION,
		execute: executeGlobTool,
		metadata: {
			category: 'workspace file search',
			execution: 'local',
			restrictions: [
				'Matches file paths inside the current workspace only.',
				'Accepts Bun-compatible glob patterns.',
				'Skips .git and node_modules.'
			],
			scope: 'workspace-only'
		},
		name: GLOB_TOOL_NAME
	},
	{
		definition: WRITE_TOOL_DEFINITION,
		execute: executeWriteTool,
		metadata: {
			category: 'workspace file editing',
			execution: 'local',
			restrictions: [
				'Writes UTF-8 text inside the current workspace only.',
				'Creates parent directories when needed.',
				'Creates new files or overwrites existing ones.',
				'Accepts at most 48,000 characters per call.'
			],
			scope: 'workspace-only'
		},
		name: WRITE_TOOL_NAME
	},
	{
		definition: EDIT_TOOL_DEFINITION,
		execute: executeEditTool,
		metadata: {
			category: 'workspace file editing',
			execution: 'local',
			restrictions: [
				'Edits UTF-8 files inside the workspace only.',
				'Requires exact text replacement.',
				'Rejects ambiguous matches unless replaceAll is true.'
			],
			scope: 'workspace-only'
		},
		name: EDIT_TOOL_NAME
	},
	{
		definition: PATCH_TOOL_DEFINITION,
		execute: executePatchTool,
		metadata: {
			category: 'workspace file patching',
			execution: 'local',
			restrictions: [
				'Patches existing UTF-8 files inside the current workspace only.',
				'Replaces inclusive line ranges.',
				'Rejects overlapping or out-of-range patches.'
			],
			scope: 'workspace-only'
		},
		name: PATCH_TOOL_NAME
	},
	{
		definition: GREP_TOOL_DEFINITION,
		execute: executeGrepTool,
		metadata: {
			category: 'workspace content search',
			execution: 'local',
			restrictions: [
				'Searches files inside the current workspace only.',
				'Skips .git and node_modules.',
				'Returns up to 40 matches by default.'
			],
			scope: 'workspace-only'
		},
		name: GREP_TOOL_NAME
	},
	{
		definition: SEARCH_TOOL_DEFINITION,
		execute: executeSearchTool,
		metadata: {
			category: 'workspace path search',
			execution: 'local',
			restrictions: [
				'Searches file paths inside the current workspace only.',
				'Can be scoped to a single file or directory path.',
				'Returns up to 40 matches by default.'
			],
			scope: 'workspace-only'
		},
		name: SEARCH_TOOL_NAME
	}
]
