import type { Database } from 'bun:sqlite'
import { randomUUID } from 'node:crypto'

import { getErrorMessage, isRecord, parseOptionalPositiveInteger } from './common'
import { withToolDatabase } from './database'
import type { ToolExecutionContext } from './tool-types'
import { parseOptionalBooleanField, parseOptionalStringField } from './value-parsers'

const DEFAULT_MAX_RESULTS = 20

export const TODO_TOOL_NAME = 'todo'

export const TODO_TOOL_DEFINITION = {
	function: {
		description: 'Manage a persistent todo list for the agent.',
		name: TODO_TOOL_NAME,
		parameters: {
			additionalProperties: false,
			properties: {
				action: { description: 'Todo action: list, add, update, remove, or clear.', type: 'string' },
				content: { description: 'Todo content for add or update.', type: 'string' },
				done: { description: 'Completion state filter or update value.', type: 'boolean' },
				id: { description: 'Todo item id for update or remove.', type: 'string' },
				limit: { description: 'Maximum number of todos to return when listing.', minimum: 1, type: 'integer' },
				notes: { description: 'Optional notes for add or update.', type: 'string' },
				priority: { description: 'Todo priority: low, medium, or high.', type: 'string' },
				query: { description: 'Text filter for list.', type: 'string' }
			},
			required: ['action'],
			type: 'object'
		},
		strict: true
	},
	type: 'function'
} as const

type TodoAction = 'add' | 'clear' | 'list' | 'remove' | 'update'
type TodoPriority = 'high' | 'low' | 'medium'
type TodoItem = {
	content: string
	createdAt: string
	done: boolean
	id: string
	notes: string
	priority: TodoPriority
	updatedAt: string
}
type TodoArguments = {
	action: TodoAction
	content?: string
	done?: boolean
	id?: string
	limit?: number
	notes?: string
	priority?: TodoPriority
	query?: string
}
type TodoDatabaseRow = {
	content: string
	createdAt: string
	done: number
	id: string
	notes: string
	priority: TodoPriority
	updatedAt: string
}
type TodoErrorResult = { error: string; ok: false }
type TodoSuccessResult =
	| { cleared: number; ok: true }
	| { id: string; ok: true; removed: boolean }
	| { item: TodoItem; ok: true }
	| { items: TodoItem[]; ok: true; total: number; truncated: boolean }

export type TodoResult = TodoErrorResult | TodoSuccessResult

export function executeTodoTool(argumentsJson: string, options: ToolExecutionContext = {}): string {
	try {
		const parsedArguments = JSON.parse(argumentsJson) as unknown
		return JSON.stringify(runTodoTool(parsedArguments, options))
	} catch (error) {
		return JSON.stringify({
			error: `Invalid todo arguments: ${getErrorMessage(error)}`,
			ok: false
		} satisfies TodoErrorResult)
	}
}

export function runTodoTool(input: unknown, options: ToolExecutionContext = {}): TodoResult {
	try {
		const argumentsValue = parseTodoArguments(input)

		return withToolDatabase(options, database => {
			switch (argumentsValue.action) {
				case 'add':
					return addTodo(database, argumentsValue)
				case 'update':
					return updateTodo(database, argumentsValue)
				case 'remove':
					return removeTodo(database, argumentsValue)
				case 'clear':
					return clearTodos(database)
				case 'list':
					return listTodos(database, argumentsValue)
			}
		})
	} catch (error) {
		return { error: getErrorMessage(error), ok: false }
	}
}

function addTodo(database: Database, argumentsValue: TodoArguments): TodoSuccessResult {
	const content = argumentsValue.content?.trim()
	if (!content) {
		throw new Error('content is required for action "add".')
	}

	const now = new Date().toISOString()
	const item: TodoItem = {
		content,
		createdAt: now,
		done: argumentsValue.done ?? false,
		id: randomUUID(),
		notes: argumentsValue.notes?.trim() ?? '',
		priority: argumentsValue.priority ?? 'medium',
		updatedAt: now
	}

	database
		.prepare(
			`INSERT INTO tool_todos (
				id,
				content,
				notes,
				priority,
				done,
				created_at,
				updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?)`
		)
		.run(item.id, item.content, item.notes, item.priority, item.done ? 1 : 0, item.createdAt, item.updatedAt)

	return { item, ok: true }
}

function updateTodo(database: Database, argumentsValue: TodoArguments): TodoSuccessResult {
	if (!argumentsValue.id?.trim()) {
		throw new Error('id is required for action "update".')
	}

	const current = database
		.prepare(
			`SELECT
				id,
				content,
				notes,
				priority,
				done,
				created_at AS createdAt,
				updated_at AS updatedAt
			FROM tool_todos
			WHERE id = ?`
		)
		.get(argumentsValue.id) as TodoDatabaseRow | null

	if (!current) {
		throw new Error(`Todo "${argumentsValue.id}" was not found.`)
	}

	const item: TodoItem = {
		content: argumentsValue.content?.trim() || current.content,
		createdAt: current.createdAt,
		done: argumentsValue.done ?? Boolean(current.done),
		id: current.id,
		notes: argumentsValue.notes?.trim() ?? current.notes,
		priority: argumentsValue.priority ?? current.priority,
		updatedAt: new Date().toISOString()
	}

	database
		.prepare(
			`UPDATE tool_todos
			SET content = ?, notes = ?, priority = ?, done = ?, updated_at = ?
			WHERE id = ?`
		)
		.run(item.content, item.notes, item.priority, item.done ? 1 : 0, item.updatedAt, item.id)

	return { item, ok: true }
}

function removeTodo(database: Database, argumentsValue: TodoArguments): TodoSuccessResult {
	if (!argumentsValue.id?.trim()) {
		throw new Error('id is required for action "remove".')
	}

	const removedCount = database.prepare('DELETE FROM tool_todos WHERE id = ?').run(argumentsValue.id).changes
	return { id: argumentsValue.id, ok: true, removed: removedCount > 0 }
}

function clearTodos(database: Database): TodoSuccessResult {
	const cleared = database.prepare('DELETE FROM tool_todos').run().changes
	return { cleared, ok: true }
}

function listTodos(database: Database, argumentsValue: TodoArguments): TodoSuccessResult {
	const query = argumentsValue.query?.trim().toLowerCase()
	const rows = database
		.prepare(
			`SELECT
				id,
				content,
				notes,
				priority,
				done,
				created_at AS createdAt,
				updated_at AS updatedAt
			FROM tool_todos
			ORDER BY done ASC, updated_at DESC`
		)
		.all() as TodoDatabaseRow[]
	const filteredTodos = rows
		.map(row => toTodoItem(row))
		.filter(item => (argumentsValue.done === undefined ? true : item.done === argumentsValue.done))
		.filter(item => {
			if (!query) {
				return true
			}

			return `${item.content}\n${item.notes}\n${item.priority}`.toLowerCase().includes(query)
		})
	const limit = argumentsValue.limit ?? DEFAULT_MAX_RESULTS

	return {
		items: filteredTodos.slice(0, limit),
		ok: true,
		total: filteredTodos.length,
		truncated: filteredTodos.length > limit
	}
}

function toTodoItem(row: TodoDatabaseRow): TodoItem {
	return {
		content: row.content,
		createdAt: row.createdAt,
		done: Boolean(row.done),
		id: row.id,
		notes: row.notes,
		priority: row.priority,
		updatedAt: row.updatedAt
	}
}

function parseTodoArguments(input: unknown): TodoArguments {
	if (!isRecord(input)) {
		throw new Error('Arguments must be a JSON object.')
	}

	const action = input.action
	if (!isTodoAction(action)) {
		throw new Error('action must be one of: list, add, update, remove, clear.')
	}

	const priority = input.priority
	if (priority !== undefined && !isTodoPriority(priority)) {
		throw new Error('priority must be one of: low, medium, high.')
	}

	return {
		action,
		content: parseOptionalStringField(input.content, 'content'),
		done: parseOptionalBooleanField(input.done, 'done'),
		id: parseOptionalStringField(input.id, 'id'),
		limit: parseOptionalPositiveInteger(input.limit, 'limit'),
		notes: parseOptionalStringField(input.notes, 'notes'),
		priority,
		query: parseOptionalStringField(input.query, 'query')
	}
}

function isTodoAction(value: unknown): value is TodoAction {
	return value === 'add' || value === 'clear' || value === 'list' || value === 'remove' || value === 'update'
}

function isTodoPriority(value: unknown): value is TodoPriority {
	return value === 'low' || value === 'medium' || value === 'high'
}
