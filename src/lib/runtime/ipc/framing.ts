import type { Readable, Writable } from 'node:stream'

const FRAME_HEADER_SIZE = 4

export function encodeFramedMessage(message: Uint8Array): Buffer {
	const header = Buffer.alloc(FRAME_HEADER_SIZE)
	header.writeUInt32BE(message.length, 0)
	return Buffer.concat([header, Buffer.from(message)])
}

export class FramedMessageReader {
	private buffer = Buffer.alloc(0)

	push(chunk: Buffer | Uint8Array, onMessage: (message: Uint8Array) => void): void {
		this.buffer = Buffer.concat([this.buffer, Buffer.from(chunk)])

		while (this.buffer.length >= FRAME_HEADER_SIZE) {
			const messageLength = this.buffer.readUInt32BE(0)
			if (this.buffer.length < FRAME_HEADER_SIZE + messageLength) {
				return
			}

			const message = this.buffer.subarray(FRAME_HEADER_SIZE, FRAME_HEADER_SIZE + messageLength)
			this.buffer = this.buffer.subarray(FRAME_HEADER_SIZE + messageLength)
			onMessage(message)
		}
	}
}

export function writeFramedMessage(stream: Writable, message: Uint8Array): void {
	stream.write(encodeFramedMessage(message))
}

export function attachFramedMessageReader(
	stream: Readable,
	onMessage: (message: Uint8Array) => void
): FramedMessageReader {
	const reader = new FramedMessageReader()
	stream.on('data', chunk => {
		reader.push(chunk as Buffer | Uint8Array, onMessage)
	})
	return reader
}
