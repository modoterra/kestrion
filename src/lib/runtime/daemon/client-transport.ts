import { createConnection, type Socket } from 'node:net'

import { decodeDaemonResponse, encodeDaemonRequest } from '../ipc/daemon-codec'
import { FramedMessageReader, writeFramedMessage } from '../ipc/framing'
import type { DaemonRequest, DaemonResponse } from './protocol'

const DEFAULT_CONNECT_TIMEOUT_MS = 5_000
const DEFAULT_REQUEST_TIMEOUT_MS = 5_000

export function connectSocket(
	socketFile: string,
	endpoint?: { host?: string; port: number },
	timeoutMs = DEFAULT_CONNECT_TIMEOUT_MS
): Promise<Socket> {
	return new Promise((resolve, reject) => {
		const socket = endpoint
			? createConnection(endpoint.port, endpoint.host ?? '127.0.0.1')
			: createConnection(socketFile)
		const timer = setTimeout(() => {
			socket.destroy()
			reject(
				new Error(
					`Timed out connecting to ${endpoint ? `${endpoint.host ?? '127.0.0.1'}:${endpoint.port}` : socketFile}.`
				)
			)
		}, timeoutMs)
		socket.once('error', error => {
			clearTimeout(timer)
			reject(error)
		})
		socket.once('connect', () => {
			clearTimeout(timer)
			resolve(socket)
		})
	})
}

export function requestDaemon<TResult>(
	socket: Socket,
	message: DaemonRequest,
	timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS
): Promise<TResult> {
	return new Promise<TResult>((resolve, reject) => {
		const reader = new FramedMessageReader()
		let settled = false
		const timer = setTimeout(() => {
			cleanup()
			socket.destroy()
			reject(new Error(`Timed out waiting for daemon response to "${message.type}".`))
		}, timeoutMs)
		const cleanup = (): void => {
			clearTimeout(timer)
			socket.off('close', onClose)
			socket.off('data', onData)
			socket.off('error', onError)
		}
		const settle = (callback: () => void): void => {
			if (settled) {
				return
			}

			settled = true
			cleanup()
			callback()
		}
		const onData = (chunk: Buffer): void => {
			reader.push(chunk, payload => {
				const response = decodeDaemonResponse(payload) as DaemonResponse
				if (response.type !== 'response' || response.id !== message.id) {
					return
				}

				settle(() => {
					if (!response.ok) {
						reject(new Error(response.error))
						return
					}

					resolve(response.result as TResult)
				})
			})
		}
		const onError = (error: Error): void => {
			settle(() => {
				reject(error)
			})
		}
		const onClose = (): void => {
			settle(() => {
				reject(
					new Error(
						`Daemon connection closed while waiting for "${message.type}". The daemon likely rejected the request before replying, often because the CLI and daemon are speaking different protocol versions.`
					)
				)
			})
		}

		socket.on('close', onClose)
		socket.on('data', onData)
		socket.on('error', onError)
		try {
			writeFramedMessage(socket, encodeDaemonRequest(message))
		} catch (error) {
			settle(() => {
				reject(error)
			})
		}
	})
}
