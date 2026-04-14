import type { InputRenderable, SelectRenderable, TextareaRenderable } from '@opentui/core'

import type { ResolvedAppConfig } from '../config'
import type { ConversationSummary } from '../types'

type ShortcutFriendlyRenderable = { traits: { capture: readonly string[] } }

export function formatConversationSummary(conversation: ConversationSummary): string {
	const preview = conversation.preview?.replaceAll(/\s+/g, ' ').trim() || 'No messages yet.'
	return `${formatTime(conversation.updatedAt)} · ${conversation.messageCount} msg · ${truncate(preview, 46)}`
}

export function formatTime(value: string): string {
	return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

export function shortenHomePath(value: string): string {
	const home = process.env.HOME
	if (home && value.startsWith(home)) {
		return `~${value.slice(home.length)}`
	}

	return value
}

export function compactProviderName(value: string): string {
	return value.replace(/\s+AI$/, '')
}

export function renderEventMeta(providerLabel: string, model: string, spinner: string): string {
	return `${compactProviderName(providerLabel)} · ${compactModelName(model)} · ${spinner}`
}

export function compactModelName(value: string): string {
	const modelName = (value.split('/').at(-1) ?? value).replace(/-instruct$/, '')
	return truncate(modelName, 18)
}

export function getConversationMeasures(containerWidth: number): {
	assistantWidth: number | '100%'
	userWidth: number | '100%'
} {
	const usableWidth = Math.max(containerWidth, 40)
	const assistantWidth: number | '100%' = containerWidth >= 72 ? Math.min(usableWidth - 8, 72) : '100%'
	const userWidth: number | '100%' = containerWidth >= 72 ? Math.min(Math.floor(usableWidth * 0.5), 44) : '100%'

	return { assistantWidth, userWidth }
}

export function getComposerInputRows(value: string, availableWidth: number, minRows: number, maxRows: number): number {
	const wrappedRows = countWrappedRows(value, Math.max(availableWidth, 12))
	return clamp(wrappedRows, minRows, maxRows)
}

export function buildApiKeyStatus(config: ResolvedAppConfig): string {
	const fireworks = config.providers.fireworks

	switch (fireworks.apiKeySource) {
		case 'env':
			return `Runtime API key source: environment variable ${fireworks.apiKeyEnv}.`
		case 'config':
			return 'Runtime API key source: saved config file.'
		default:
			return `Runtime API key source: missing. Set ${fireworks.apiKeyEnv} or save a key below.`
	}
}

export function configureShortcutFriendlyField(
	renderable: InputRenderable | SelectRenderable | TextareaRenderable | null
): void {
	if (!renderable) {
		return
	}

	;(renderable as unknown as ShortcutFriendlyRenderable).traits = { capture: ['escape', 'navigate', 'submit'] }
}

export function truncate(value: string, maxLength: number): string {
	if (value.length <= maxLength) {
		return value
	}

	return `${value.slice(0, maxLength - 3)}...`
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.max(minimum, Math.min(maximum, value))
}

function countWrappedRows(value: string, width: number): number {
	if (value.length === 0) {
		return 1
	}

	return value.split(/\r?\n/).reduce((total, line) => {
		if (line.length === 0) {
			return total + 1
		}

		return total + Math.max(1, Math.ceil(line.length / width))
	}, 0)
}
