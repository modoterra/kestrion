import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { RGBA, SyntaxStyle, TreeSitterClient } from '@opentui/core'

import { THEME } from './constants'

const OPENTUI_TREE_SITTER_SOURCE_PATH = fileURLToPath(
	new URL('../../../node_modules/@opentui/core/parser.worker.js', import.meta.url)
)
const WEB_TREE_SITTER_MODULE_URL = pathToFileURL(
	fileURLToPath(new URL('../../../node_modules/web-tree-sitter/web-tree-sitter.js', import.meta.url))
).href
const WEB_TREE_SITTER_WASM_URL = pathToFileURL(
	fileURLToPath(new URL('../../../node_modules/web-tree-sitter/web-tree-sitter.wasm', import.meta.url))
).href
const PATCHED_TREE_SITTER_DIRECTORY = join(tmpdir(), 'kestrion', 'tree-sitter')
const PATCHED_TREE_SITTER_WORKER_PATH = join(PATCHED_TREE_SITTER_DIRECTORY, 'opentui-parser.worker.js')
const TREE_SITTER_CACHE_DIRECTORY = join(PATCHED_TREE_SITTER_DIRECTORY, 'cache')
const WEB_TREE_SITTER_MODULE_IMPORT = 'import { Parser, Query, Language } from "web-tree-sitter";'
const WEB_TREE_SITTER_IMPORT_PATTERN =
	/await import\("web-tree-sitter\/tree-sitter\.wasm",\s*\{\s*with:\s*\{\s*type:\s*"wasm"\s*\}\s*\}\s*\)/

export const AGENT_MESSAGE_MARKDOWN_STYLE = SyntaxStyle.fromStyles({
	default: { fg: RGBA.fromHex(THEME.offWhite) },
	markup: { fg: RGBA.fromHex(THEME.offWhite) },
	'markup.emphasis': { fg: RGBA.fromHex(THEME.offWhite), italic: true },
	'markup.heading': { fg: RGBA.fromHex(THEME.offWhite), bold: true },
	'markup.heading.1': { fg: RGBA.fromHex(THEME.offWhite), bold: true },
	'markup.heading.2': { fg: RGBA.fromHex(THEME.offWhite), bold: true },
	'markup.heading.3': { fg: RGBA.fromHex(THEME.offWhite), bold: true },
	'markup.link': { fg: RGBA.fromHex(THEME.providerBlue), underline: true },
	'markup.link.label': { fg: RGBA.fromHex(THEME.providerBlue), underline: true },
	'markup.link.url': { fg: RGBA.fromHex(THEME.providerBlue), underline: true },
	'markup.list': { fg: RGBA.fromHex(THEME.accent) },
	'markup.quote': { fg: RGBA.fromHex(THEME.softLabel), italic: true },
	'markup.raw': { fg: RGBA.fromHex(THEME.summaryAccent) },
	'markup.raw.block': { bg: RGBA.fromHex(THEME.panelRaised), fg: RGBA.fromHex(THEME.offWhite) },
	'markup.strikethrough': { dim: true, fg: RGBA.fromHex(THEME.softText) },
	'markup.strong': { fg: RGBA.fromHex(THEME.offWhite), bold: true }
})

export const AGENT_MESSAGE_MARKDOWN_TREE_SITTER_CLIENT = createAgentMessageMarkdownTreeSitterClient()
void AGENT_MESSAGE_MARKDOWN_TREE_SITTER_CLIENT.preloadParser('markdown')
void AGENT_MESSAGE_MARKDOWN_TREE_SITTER_CLIENT.preloadParser('markdown_inline')

export function createAgentMessageMarkdownTreeSitterClient(): TreeSitterClient {
	return new TreeSitterClient({
		dataPath: TREE_SITTER_CACHE_DIRECTORY,
		workerPath: ensurePatchedOpenTuiTreeSitterWorker()
	})
}

function ensurePatchedOpenTuiTreeSitterWorker(): string {
	mkdirSync(PATCHED_TREE_SITTER_DIRECTORY, { recursive: true })

	const source = readFileSync(OPENTUI_TREE_SITTER_SOURCE_PATH, 'utf8')
	const workerSource = source.replace(
		WEB_TREE_SITTER_MODULE_IMPORT,
		`import { Parser, Query, Language } from ${JSON.stringify(WEB_TREE_SITTER_MODULE_URL)};`
	)
	const patchedSource = workerSource.replace(
		WEB_TREE_SITTER_IMPORT_PATTERN,
		`await import(${JSON.stringify(WEB_TREE_SITTER_WASM_URL)}, { with: { type: "wasm" } })`
	)

	if (patchedSource === source || patchedSource === workerSource) {
		throw new Error('Failed to patch the OpenTUI tree-sitter worker.')
	}

	writeFileSync(PATCHED_TREE_SITTER_WORKER_PATH, patchedSource)

	return pathToFileURL(PATCHED_TREE_SITTER_WORKER_PATH).href
}
