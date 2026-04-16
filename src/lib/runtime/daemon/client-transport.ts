import { createConnection, type Socket } from 'node:net'

import type { DaemonRequest, DaemonResponse } from './protocol'

export function connectSocket(socketFile: string, endpoint?: { host?: string; port: number }): Promise<Socket> {
	return new Promise((resolve, reject) => {
		const socket = endpoint
			? createConnection(endpoint.port, endpoint.host ?? '127.0.0.1')
			: createConnection(socketFile)
		socket.once('error', reject)
		socket.once('connect', () => {
			socket.off('error', reject)
			resolve(socket)
		})
	})
}

export function requestDaemon<TResult>(socket: Socket, message: DaemonRequest): Promise<TResult> {
	return new Promise<TResult>((resolve, reject) => {
		let buffer = ''
		socket.setEncoding('utf8')
		const onData = (chunk: string): void => {
			buffer += chunk
			let newlineIndex = buffer.indexOf('\n')
			while (newlineIndex >= 0) {
				const line = buffer.slice(0, newlineIndex).trim()
				buffer = buffer.slice(newlineIndex + 1)
				if (line) {
					const response = JSON.parse(line) as DaemonResponse
					if (response.type !== 'response' || response.id !== message.id) {
						newlineIndex = buffer.indexOf('\n')
						continue
					}

					socket.off('data', onData)
					if (!response.ok) {
						reject(new Error(response.error))
						return
					}

					resolve(response.result as TResult)
					return
				}
				newlineIndex = buffer.indexOf('\n')
			}
		}

		socket.on('data', onData)
		socket.write(`${JSON.stringify(message)}\n`)
	})
}
