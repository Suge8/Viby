import type { PairingReconnectRequest } from '@viby/protocol'
import { readBrowserStorageJson, removeBrowserStorageItem, writeBrowserStorageJson } from '@/lib/browserStorage'
import { getPairingDeviceStorageKey } from '@/lib/storage/storageRegistry'

type PairingDeviceIdentity = {
    publicKey: string
    privateKeyJwk: JsonWebKey
}

function encodeBase64Url(bytes: Uint8Array): string {
    let binary = ''
    for (const byte of bytes) {
        binary += String.fromCharCode(byte)
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function createProofPayload(pairingId: string, challengeNonce: string, signedAt: number): Uint8Array {
    return new TextEncoder().encode(`${pairingId}:${challengeNonce}:${signedAt}`)
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

function isStoredIdentity(value: unknown): value is PairingDeviceIdentity {
    if (!value || typeof value !== 'object') {
        return false
    }
    const candidate = value as { publicKey?: unknown; privateKeyJwk?: unknown }
    return typeof candidate.publicKey === 'string' && typeof candidate.privateKeyJwk === 'object'
}

async function createIdentity(pairingId: string): Promise<PairingDeviceIdentity> {
    const keyPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
    const [publicKey, privateKeyJwk] = await Promise.all([
        crypto.subtle.exportKey('spki', keyPair.publicKey),
        crypto.subtle.exportKey('jwk', keyPair.privateKey),
    ])
    const identity = {
        publicKey: encodeBase64Url(new Uint8Array(publicKey)),
        privateKeyJwk,
    }
    writeBrowserStorageJson('local', getPairingDeviceStorageKey(pairingId), identity)
    return identity
}

export async function loadPairingDeviceIdentity(pairingId: string): Promise<PairingDeviceIdentity> {
    const storageKey = getPairingDeviceStorageKey(pairingId)
    const cached = readBrowserStorageJson({
        storage: 'local',
        key: storageKey,
        parse: (value) => {
            try {
                const parsed = JSON.parse(value) as unknown
                return isStoredIdentity(parsed) ? parsed : null
            } catch {
                return null
            }
        },
    })
    if (cached) {
        return cached
    }

    return await createIdentity(pairingId)
}

export async function createReconnectDeviceProof(
    pairingId: string,
    identity: PairingDeviceIdentity,
    challengeNonce: string
): Promise<NonNullable<PairingReconnectRequest['deviceProof']>> {
    const signedAt = Date.now()
    const privateKey = await crypto.subtle.importKey(
        'jwk',
        identity.privateKeyJwk,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['sign']
    )
    const signature = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        privateKey,
        toArrayBuffer(createProofPayload(pairingId, challengeNonce, signedAt))
    )

    return {
        publicKey: identity.publicKey,
        challengeNonce,
        signedAt,
        signature: encodeBase64Url(new Uint8Array(signature)),
    }
}

export function clearPairingDeviceIdentity(pairingId: string): void {
    removeBrowserStorageItem('local', getPairingDeviceStorageKey(pairingId))
}
