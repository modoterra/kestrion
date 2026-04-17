import { createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { AppPaths } from '../paths'
import { sha256Hex, stableStringify } from './common'

export type TrustedSigner = { keyId: string; publicKeyPem: string }
type LocalSigner = TrustedSigner & { privateKeyPem: string }

type SignatureEnvelope = { payload: Record<string, unknown>; signature: string; signerKeyId: string }

export function ensureLocalSigner(paths: AppPaths): LocalSigner {
	if (!existsSync(paths.localPrivateKeyFile) || !existsSync(paths.localPublicKeyFile)) {
		const generated = generateKeyPairSync('ed25519')
		writeFileSync(paths.localPrivateKeyFile, generated.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString())
		writeFileSync(paths.localPublicKeyFile, generated.publicKey.export({ format: 'pem', type: 'spki' }).toString())
	}

	const privateKeyPem = readFileSync(paths.localPrivateKeyFile, 'utf8')
	const publicKeyPem = readFileSync(paths.localPublicKeyFile, 'utf8')
	return { keyId: computeKeyId(publicKeyPem), privateKeyPem, publicKeyPem }
}

export function loadTrustedSigners(paths: AppPaths): TrustedSigner[] {
	const trustedSigners = new Map<string, TrustedSigner>()
	const localSigner = ensureLocalSigner(paths)
	trustedSigners.set(localSigner.keyId, { keyId: localSigner.keyId, publicKeyPem: localSigner.publicKeyPem })

	for (const entry of readdirSync(paths.trustedKeysDir, { withFileTypes: true })) {
		if (!entry.isFile()) {
			continue
		}

		const publicKeyPem = readFileSync(join(paths.trustedKeysDir, entry.name), 'utf8')
		const keyId = computeKeyId(publicKeyPem)
		trustedSigners.set(keyId, { keyId, publicKeyPem })
	}

	return [...trustedSigners.values()].toSorted((left, right) => left.keyId.localeCompare(right.keyId))
}

export function signPayload(paths: AppPaths, payload: Record<string, unknown>): SignatureEnvelope {
	const signer = ensureLocalSigner(paths)
	const payloadText = stableStringify(payload)
	const signature = sign(null, Buffer.from(payloadText), signer.privateKeyPem).toString('base64')
	return { payload, signature, signerKeyId: signer.keyId }
}

export function verifyPayloadSignature(
	trustedSigners: TrustedSigner[],
	signerKeyId: string,
	payload: Record<string, unknown>,
	signature: string
): { ok: true } | { error: string; ok: false } {
	if (!signerKeyId.trim() || !signature.trim()) {
		return { error: 'Missing signer metadata.', ok: false }
	}

	const signer = trustedSigners.find(candidate => candidate.keyId === signerKeyId)
	if (!signer) {
		return { error: `Signer "${signerKeyId}" is not trusted.`, ok: false }
	}

	const payloadText = stableStringify(payload)
	const verified = verify(
		null,
		Buffer.from(payloadText),
		createPublicKey(signer.publicKeyPem),
		Buffer.from(signature, 'base64')
	)
	return verified ? { ok: true } : { error: `Signature verification failed for signer "${signerKeyId}".`, ok: false }
}

function computeKeyId(publicKeyPem: string): string {
	return sha256Hex(publicKeyPem.trim())
}
