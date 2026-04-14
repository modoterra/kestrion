import type { KeyEvent } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import {
	createContext,
	type MutableRefObject,
	type ReactNode,
	useContext,
	useLayoutEffect,
	useMemo,
	useRef
} from 'react'

export type KeyboardHandler = (key: KeyEvent) => void

type RegisteredKeyboardHandler = {
	handlerRef: MutableRefObject<KeyboardHandler>
	order: number
	priority: number
	token: symbol
}

type KeyboardRegistryContextValue = {
	registerHandler: (handlerRef: MutableRefObject<KeyboardHandler>, priority: number) => () => void
}

const KeyboardRegistryContext = createContext<KeyboardRegistryContextValue | null>(null)

export function KeyboardProvider({ children }: { children: ReactNode }): ReactNode {
	const handlersRef = useRef<RegisteredKeyboardHandler[]>([])
	const nextOrderRef = useRef(0)
	const value = useMemo<KeyboardRegistryContextValue>(
		() => ({
			registerHandler: (handlerRef, priority) => {
				const token = Symbol('keyboard-handler')
				const entry = { handlerRef, order: nextOrderRef.current++, priority, token }
				handlersRef.current = [...handlersRef.current, entry]

				return (): void => {
					handlersRef.current = handlersRef.current.filter(candidate => candidate.token !== token)
				}
			}
		}),
		[]
	)

	useKeyboard(key => {
		const handlers = handlersRef.current.toSorted(sortRegisteredKeyboardHandlers)

		for (const entry of handlers) {
			entry.handlerRef.current(key)
			if (key.propagationStopped) {
				return
			}
		}
	})

	return <KeyboardRegistryContext.Provider value={value}>{children}</KeyboardRegistryContext.Provider>
}

export function useKeyboardHandler(handler: KeyboardHandler, options?: { priority?: number }): void {
	const registry = useContext(KeyboardRegistryContext)
	const handlerRef = useRef(handler)
	const priority = options?.priority ?? 10

	if (!registry) {
		throw new Error('useKeyboardHandler must be used within a KeyboardProvider')
	}

	useLayoutEffect(() => {
		handlerRef.current = handler
	}, [handler])

	useLayoutEffect(() => registry.registerHandler(handlerRef, priority), [priority, registry])
}

function sortRegisteredKeyboardHandlers(left: RegisteredKeyboardHandler, right: RegisteredKeyboardHandler): number {
	return right.priority - left.priority || right.order - left.order
}
