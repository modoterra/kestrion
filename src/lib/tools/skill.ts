import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { getAppPaths, getErrorMessage, isRecord } from './common'
import type { ToolExecutionContext } from './tool-types'

export const SKILL_TOOL_NAME = 'skill'

export const SKILL_TOOL_DEFINITION = {
	function: {
		description: 'List or invoke local skills stored in ~/.share/kestrion/skills.',
		name: SKILL_TOOL_NAME,
		parameters: {
			additionalProperties: false,
			properties: {
				action: { description: 'Skill action: list or invoke.', type: 'string' },
				include: {
					description: 'Optional extra skill-relative files to include when invoking.',
					items: { type: 'string' },
					type: 'array'
				},
				name: { description: 'Skill name to invoke.', type: 'string' }
			},
			required: ['action'],
			type: 'object'
		},
		strict: true
	},
	type: 'function'
} as const

type SkillAction = 'invoke' | 'list'
type SkillArguments = { action: SkillAction; include?: string[]; name?: string }
type SkillErrorResult = { error: string; ok: false }
type SkillListResult = { items: Array<{ name: string; path: string }>; ok: true }
type SkillInvokeResult = {
	files: Array<{ content: string; path: string }>
	name: string
	ok: true
	path: string
	skill: string
}

export type SkillResult = SkillErrorResult | SkillInvokeResult | SkillListResult

export function executeSkillTool(argumentsJson: string, options: ToolExecutionContext = {}): string {
	try {
		const parsedArguments = JSON.parse(argumentsJson) as unknown
		return JSON.stringify(runSkillTool(parsedArguments, options))
	} catch (error) {
		return JSON.stringify({
			error: `Invalid skill arguments: ${getErrorMessage(error)}`,
			ok: false
		} satisfies SkillErrorResult)
	}
}

export function runSkillTool(input: unknown, options: ToolExecutionContext = {}): SkillResult {
	try {
		const argumentsValue = parseSkillArguments(input)
		const { skillsDir } = getAppPaths(options)
		const allowedSkillNames = options.allowedSkillNames

		if (argumentsValue.action === 'list') {
			const skills = listSkills(skillsDir).filter(skill => isAllowedSkillName(skill, allowedSkillNames))
			return { items: skills.map(skill => ({ name: skill, path: join(skillsDir, skill) })), ok: true }
		}

		const name = argumentsValue.name?.trim()
		if (!name) {
			throw new Error('name is required for action "invoke".')
		}
		if (!isAllowedSkillName(name, allowedSkillNames)) {
			throw new Error(`Skill "${name}" is denied by policy.`)
		}

		const skillDirectory = resolveSkillDirectory(skillsDir, name)
		const skillFile = join(skillDirectory, 'SKILL.md')
		if (!existsSync(skillFile)) {
			throw new Error(`Skill "${name}" is missing SKILL.md.`)
		}

		const files = [
			skillFile,
			...(argumentsValue.include ?? []).map(file => resolveIncludedSkillFile(skillDirectory, file))
		].map(path => ({ content: readFileSync(path, 'utf8'), path }))

		return { files, name, ok: true, path: skillDirectory, skill: readFileSync(skillFile, 'utf8') }
	} catch (error) {
		return { error: getErrorMessage(error), ok: false }
	}
}

function isAllowedSkillName(name: string, allowedSkillNames: string[] | undefined): boolean {
	if (!allowedSkillNames) {
		return true
	}

	return allowedSkillNames.includes(name)
}

function parseSkillArguments(input: unknown): SkillArguments {
	if (!isRecord(input)) {
		throw new Error('Arguments must be a JSON object.')
	}

	const action = input.action
	if (action !== 'invoke' && action !== 'list') {
		throw new Error('action must be one of: list, invoke.')
	}

	const include = input.include
	if (
		include !== undefined &&
		(!Array.isArray(include) || include.some(value => typeof value !== 'string' || !value.trim()))
	) {
		throw new Error('include must be an array of non-empty strings when provided.')
	}

	const name = input.name
	if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
		throw new Error('name must be a non-empty string when provided.')
	}

	return { action, include, name }
}

function listSkills(skillsDir: string): string[] {
	if (!existsSync(skillsDir)) {
		return []
	}

	return readdirSync(skillsDir, { withFileTypes: true })
		.filter(entry => entry.isDirectory() && existsSync(join(skillsDir, entry.name, 'SKILL.md')))
		.map(entry => entry.name)
		.toSorted((left, right) => left.localeCompare(right))
}

function resolveSkillDirectory(skillsDir: string, name: string): string {
	const resolvedSkillsDir = resolve(skillsDir)
	const skillDirectory = resolve(resolvedSkillsDir, name)
	if (isOutsideDirectory(resolvedSkillsDir, skillDirectory)) {
		throw new Error('Skill path is outside the skills directory.')
	}
	if (!existsSync(skillDirectory) || !statSync(skillDirectory).isDirectory()) {
		throw new Error(`Skill "${name}" was not found.`)
	}

	return skillDirectory
}

function resolveIncludedSkillFile(skillDirectory: string, relativePath: string): string {
	const filePath = resolve(skillDirectory, relativePath)
	if (isOutsideDirectory(resolve(skillDirectory), filePath)) {
		throw new Error(`Included file is outside the skill directory: ${relativePath}`)
	}
	if (!existsSync(filePath) || !statSync(filePath).isFile()) {
		throw new Error(`Included skill file was not found: ${relativePath}`)
	}

	return filePath
}

function isOutsideDirectory(rootDirectory: string, candidatePath: string): boolean {
	const relativePath = relative(rootDirectory, candidatePath)
	return relativePath.startsWith('..') || relativePath === '' ? relativePath.startsWith('..') : false
}
