import { SelectRenderable, SliderRenderable } from '@opentui/core'
import { extend } from '@opentui/react'

declare module '@opentui/react' {
	interface OpenTUIComponents {
		slider: typeof SliderRenderable
	}
}

extend({ slider: SliderRenderable })

type SelectRenderablePatchShape = {
	_backgroundColor: string
	_descriptionColor: string
	_focused: boolean
	_focusedTextColor: string
	_font?: unknown
	_itemSpacing: number
	_options: Array<{ description: string; name: string }>
	_selectedBackgroundColor: string
	_selectedDescriptionColor: string
	_selectedIndex: number
	_selectedTextColor: string
	_showDescription: boolean
	_showScrollIndicator: boolean
	_textColor: string
	fontHeight: number
	frameBuffer?: {
		clear: (color: string) => void
		drawText: (text: string, x: number, y: number, color: string) => void
		fillRect: (x: number, y: number, width: number, height: number, color: string) => void
	}
	height: number
	linesPerItem: number
	maxVisibleItems: number
	renderScrollIndicatorToFrameBuffer: (x: number, y: number, width: number, height: number) => void
	scrollOffset: number
	width: number
}

const selectPrototype = SelectRenderable.prototype as unknown as {
	refreshFrameBuffer?: (this: SelectRenderablePatchShape) => void
}

const originalSelectRefreshFrameBuffer = selectPrototype.refreshFrameBuffer

if (originalSelectRefreshFrameBuffer) {
	selectPrototype.refreshFrameBuffer = function patchedSelectRefreshFrameBuffer(): void {
		if (this._font) {
			return originalSelectRefreshFrameBuffer.call(this)
		}

		if (!this.frameBuffer) {
			return
		}

		const bgColor = this._backgroundColor
		this.frameBuffer.clear(bgColor)

		if (this._options.length === 0) {
			return
		}

		const contentX = 0
		const contentY = 0
		const contentWidth = this.width
		const contentHeight = this.height
		const visibleOptions = this._options.slice(this.scrollOffset, this.scrollOffset + this.maxVisibleItems)

		renderVisibleOptions(this, visibleOptions, contentX, contentY, contentWidth, contentHeight)

		if (this._showScrollIndicator && this._options.length > this.maxVisibleItems) {
			this.renderScrollIndicatorToFrameBuffer(contentX, contentY, contentWidth, contentHeight)
		}
	}
}

function renderVisibleOptions(
	renderable: SelectRenderablePatchShape,
	visibleOptions: Array<{ description: string; name: string }>,
	contentX: number,
	contentY: number,
	contentWidth: number,
	contentHeight: number
): void {
	for (let i = 0; i < visibleOptions.length; i += 1) {
		const option = visibleOptions[i]
		if (!option) {
			continue
		}

		const actualIndex = renderable.scrollOffset + i
		const itemY = contentY + i * renderable.linesPerItem
		if (itemY + renderable.linesPerItem - 1 >= contentY + contentHeight) {
			break
		}

		const isSelected = actualIndex === renderable._selectedIndex
		drawOptionRow(renderable, option, contentX, contentWidth, itemY, contentHeight, isSelected)
	}
}

function drawOptionRow(
	renderable: SelectRenderablePatchShape,
	option: { description: string; name: string },
	contentX: number,
	contentWidth: number,
	itemY: number,
	contentHeight: number,
	isSelected: boolean
): void {
	if (isSelected) {
		renderable.frameBuffer?.fillRect(
			contentX,
			itemY,
			contentWidth,
			renderable.linesPerItem - renderable._itemSpacing,
			renderable._selectedBackgroundColor
		)
	}

	const nameContent = `${isSelected ? '· ' : '  '}${option.name}`
	const baseTextColor = renderable._focused ? renderable._focusedTextColor : renderable._textColor
	const nameColor = isSelected ? renderable._selectedTextColor : baseTextColor
	const descColor = isSelected ? renderable._selectedDescriptionColor : renderable._descriptionColor
	renderable.frameBuffer?.drawText(nameContent, contentX + 1, itemY, nameColor)

	if (renderable._showDescription && itemY + renderable.fontHeight < contentHeight) {
		renderable.frameBuffer?.drawText(option.description, contentX + 3, itemY + renderable.fontHeight, descColor)
	}
}
