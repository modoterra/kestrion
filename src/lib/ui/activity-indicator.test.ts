import { expect, test } from 'bun:test'

import {
	getActivityIndicatorColor,
	getActivityIndicatorFrame,
	getActivityIndicatorFrameCount
} from './activity-indicator'

test('cycles the Braille micro-spinner frames', () => {
	expect(getActivityIndicatorFrameCount()).toBe(8)
	expect(getActivityIndicatorFrame(0)).toBe('⠁')
	expect(getActivityIndicatorFrame(3)).toBe('⡀')
	expect(getActivityIndicatorFrame(7)).toBe('⠈')
	expect(getActivityIndicatorFrame(8)).toBe('⠁')
})

test('pulses spinner colors by variant', () => {
	expect(getActivityIndicatorColor(0, 'accent')).toBe('#6470a3')
	expect(getActivityIndicatorColor(4, 'accent')).toBe('#aebcff')
	expect(getActivityIndicatorColor(4, 'summary')).toBe('#d8bf63')
	expect(getActivityIndicatorColor(12, 'muted')).toBe('#adada6')
})
