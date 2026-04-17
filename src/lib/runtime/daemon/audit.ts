import { appendFileSync } from 'node:fs'

import { buildAuditEnvelope, getPreviousAuditHash } from '../../integrity/audit'
import type { AppPaths } from '../../paths'
import type { ToolInvocationAuditRecord, ToolMutationRecord } from '../../tools/tool-types'

type AuditBase = { conversationId: string; timestamp: string; turnId: string }

export function appendMutationAuditRecord(paths: AppPaths, context: AuditBase, mutation: ToolMutationRecord): void {
	appendAuditEntry(paths, { ...context, kind: 'mutation', mutation })
}

export function appendToolInvocationAuditRecord(
	paths: AppPaths,
	context: AuditBase,
	tool: ToolInvocationAuditRecord
): void {
	appendAuditEntry(paths, { ...context, kind: 'toolInvocation', tool })
}

function appendAuditEntry(paths: AppPaths, entry: Record<string, unknown>): void {
	const auditFile = `${paths.auditDir}/${String(entry.timestamp).slice(0, 10)}.jsonl`
	const envelope = buildAuditEnvelope(entry, getPreviousAuditHash(auditFile))
	appendFileSync(auditFile, `${JSON.stringify(envelope)}\n`)
}
