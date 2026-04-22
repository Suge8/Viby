import { createHash, randomBytes, timingSafeEqual, webcrypto } from 'node:crypto'

const subtle = globalThis.crypto?.subtle ?? webcrypto.subtle
export const PAIRING_DEVICE_PROOF_MAX_AGE_MS = 60_000

function toBase64Url(bytes: Uint8Array): string {
    let binary = ''
    for (const byte of bytes) {
        binary += String.fromCharCode(byte)
    }

    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function fromBase64Url(value: string): Uint8Array {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    const binary = atob(padded)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index)
    }
    return bytes
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    return new Uint8Array(bytes).buffer
}

export function buildPairingDeviceProofPayload(
    pairingId: string,
    challengeNonce: string,
    signedAt: number
): Uint8Array {
    return new TextEncoder().encode(`${pairingId}:${challengeNonce}:${signedAt}`)
}

export function generatePairingId(): string {
    return toBase64Url(randomBytes(12))
}

export function generatePairingSecret(byteLength = 32): string {
    return toBase64Url(randomBytes(byteLength))
}

export function generatePairingShortCode(): string {
    const value = randomBytes(4).readUInt32BE(0) % 1_000_000
    return value.toString().padStart(6, '0')
}

export function hashPairingSecret(secret: string): string {
    return createHash('sha256').update(secret).digest('base64url')
}

export function isMatchingSecretHash(expectedHash: string, secret: string): boolean {
    const actualHash = hashPairingSecret(secret)
    const encoder = new TextEncoder()
    return timingSafeEqual(encoder.encode(expectedHash), encoder.encode(actualHash))
}

export function tokenHint(secret: string, length = 6): string {
    return secret.slice(-Math.max(1, length))
}

export async function verifyPairingDeviceProof(options: {
    pairingId: string
    challengeNonce: string
    signedAt: number
    publicKey: string
    signature: string
    now: number
}): Promise<boolean> {
    if (Math.abs(options.now - options.signedAt) > PAIRING_DEVICE_PROOF_MAX_AGE_MS) {
        return false
    }

    try {
        const key = await subtle.importKey(
            'spki',
            toArrayBuffer(fromBase64Url(options.publicKey)),
            { name: 'ECDSA', namedCurve: 'P-256' },
            false,
            ['verify']
        )

        return await subtle.verify(
            { name: 'ECDSA', hash: 'SHA-256' },
            key,
            toArrayBuffer(fromBase64Url(options.signature)),
            toArrayBuffer(buildPairingDeviceProofPayload(options.pairingId, options.challengeNonce, options.signedAt))
        )
    } catch {
        return false
    }
}
