import type { Renderable } from '@opentui/core'
import { useRenderer } from '@opentui/react'
import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from 'react'

type ViewEntry = { element: ReactNode; onPop?: () => void }

type ViewStackContextValue = {
	current: ViewEntry | null
	isActive: boolean
	pop: () => void
	push: (entry: ViewEntry) => void
}

const ViewStackContext = createContext<ViewStackContextValue | null>(null)

export function ViewStackProvider({ children }: { children: ReactNode }): ReactNode {
	const { current, pop, push } = useViewStackController()
	const value = useMemo<ViewStackContextValue>(
		() => ({ current, isActive: current !== null, pop, push }),
		[current, pop, push]
	)

	return <ViewStackContext.Provider value={value}>{children}</ViewStackContext.Provider>
}

export function useViewStack(): ViewStackContextValue {
	const value = useContext(ViewStackContext)
	if (!value) {
		throw new Error('useViewStack must be used within a ViewStackProvider')
	}

	return value
}

function useViewStackController(): Pick<ViewStackContextValue, 'current' | 'pop' | 'push'> {
	const renderer = useRenderer()
	const [stack, setStack] = useState<ViewEntry[]>([])
	const stackRef = useRef<ViewEntry[]>([])
	const focusStackRef = useRef<Array<Renderable | null>>([])
	const refocus = useCallback(
		(target: Renderable | null): void => {
			setTimeout(() => {
				if (!target || target.isDestroyed || !containsRenderable(renderer.root, target)) {
					return
				}

				target.focus()
			}, 1)
		},
		[renderer]
	)
	const push = useCallback(
		(entry: ViewEntry): void => {
			const currentFocus = renderer.currentFocusedRenderable
			currentFocus?.blur()
			focusStackRef.current = [...focusStackRef.current, currentFocus]
			updateStack(stackRef, setStack, current => [...current, entry])
		},
		[renderer]
	)
	const pop = useCallback((): void => {
		const currentStack = stackRef.current
		const current = currentStack.at(-1)
		if (!current) {
			return
		}

		const nextDepth = currentStack.length - 1
		current.onPop?.()
		focusStackRef.current = focusStackRef.current.slice(0, nextDepth)
		updateStack(stackRef, setStack, value => value.slice(0, -1))
		refocus(focusStackRef.current[nextDepth] ?? null)
	}, [refocus])

	return { current: stack.at(-1) ?? null, pop, push }
}

function updateStack(
	stackRef: { current: ViewEntry[] },
	setStack: (stack: ViewEntry[]) => void,
	update: (current: ViewEntry[]) => ViewEntry[]
): void {
	const nextStack = update(stackRef.current)
	stackRef.current = nextStack
	setStack(nextStack)
}

function containsRenderable(root: Renderable, target: Renderable): boolean {
	if (root === target) {
		return true
	}

	for (const child of root.getChildren()) {
		if (!(child instanceof Object) || !('getChildren' in child)) {
			continue
		}

		if (containsRenderable(child as Renderable, target)) {
			return true
		}
	}

	return false
}
