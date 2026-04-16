import type { ReactNode } from 'react'

import {
	getActivityIndicatorColor,
	getActivityIndicatorFrame,
	type ActivityIndicatorVariant
} from '../../../lib/ui/activity-indicator'

type ActivityIndicatorProps = { frameIndex: number; variant?: ActivityIndicatorVariant }

export function ActivityIndicator({ frameIndex, variant = 'accent' }: ActivityIndicatorProps): ReactNode {
	return <span fg={getActivityIndicatorColor(frameIndex, variant)}>{getActivityIndicatorFrame(frameIndex)}</span>
}
