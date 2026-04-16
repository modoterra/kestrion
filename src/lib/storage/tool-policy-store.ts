import { eq } from 'drizzle-orm'

import { toolPolicy } from '../../db/schema'
import { DENY_ALL_TOOL_POLICY, normalizeToolPolicy, type ToolPolicy } from '../tools/policy'
import type { AppDatabase } from './app-database'

type ToolPolicyRow = { policyJson: string; updatedAt: string }

export function loadStoredToolPolicy(database: AppDatabase): ToolPolicy {
	const row = database
		.select({ policyJson: toolPolicy.policyJson, updatedAt: toolPolicy.updatedAt })
		.from(toolPolicy)
		.where(eq(toolPolicy.id, 1))
		.get() as ToolPolicyRow | undefined

	if (!row) {
		return DENY_ALL_TOOL_POLICY
	}

	try {
		return normalizeToolPolicy(JSON.parse(row.policyJson) as unknown)
	} catch {
		return DENY_ALL_TOOL_POLICY
	}
}

export function saveStoredToolPolicy(database: AppDatabase, policy: ToolPolicy): ToolPolicy {
	const normalizedPolicy = normalizeToolPolicy(policy)
	const updatedAt = new Date().toISOString()

	database
		.insert(toolPolicy)
		.values({ id: 1, policyJson: JSON.stringify(normalizedPolicy), updatedAt })
		.onConflictDoUpdate({ set: { policyJson: JSON.stringify(normalizedPolicy), updatedAt }, target: toolPolicy.id })
		.run()

	return normalizedPolicy
}
