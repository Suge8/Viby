import type { PairingReconnectRequest } from '@viby/protocol'
import {
    readBrowserStorageItem,
    readBrowserStorageItemOrThrow,
    removeBrowserStorageItem,
    writeBrowserStorageJson,
} from '@/lib/browserStorage'
import {
    readAppCacheRecord,
    readAppCacheRecordOrThrow,
    removeAppCacheRecord,
    writeAppCacheRecord,
} from '@/lib/storage/appCacheDb'
import { APP_CACHE_STORES, getPairingDeviceStorageKey } from '@/lib/storage/storageRegistry'

type PairingDeviceIdentity = {
    privateKey: CryptoKey
    publicKey: string
}

type LegacyPairingDeviceIdentity = {
    privateKeyJwk: JsonWebKey
    publicKey: string
}

const DEVICE_KEY_INDEX_VERSION = 1
const DEVICE_KEY_INDEX_STORE = 'indexeddb'

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

function isPrivateKeyJwk(value: unknown): value is JsonWebKey {
    if (!value || typeof value !== 'object') return false
    const jwk = value as JsonWebKey
    return jwk.kty === 'EC' && jwk.crv === 'P-256' && typeof jwk.d === 'string'
}

function isLegacyIdentity(value: unknown): value is LegacyPairingDeviceIdentity {
    if (!value || typeof value !== 'object') return false
    const candidate = value as { privateKeyJwk?: unknown; publicKey?: unknown }
    return typeof candidate.publicKey === 'string' && isPrivateKeyJwk(candidate.privateKeyJwk)
}

function isPairingPrivateKey(value: unknown): value is CryptoKey {
    if (!value || typeof value !== 'object') return false
    const key = value as CryptoKey
    const algorithm = key.algorithm as EcKeyAlgorithm | undefined
    return (
        key.type === 'private' &&
        key.usages.includes('sign') &&
        algorithm?.name === 'ECDSA' &&
        algorithm.namedCurve === 'P-256'
    )
}

async function storeIdentity(pairingId: string, identity: PairingDeviceIdentity): Promise<boolean> {
    const stored = await writeAppCacheRecord(APP_CACHE_STORES.pairingDeviceKeys, pairingId, {
        createdAt: Date.now(),
        privateKey: identity.privateKey,
        publicKey: identity.publicKey,
    })
    if (!stored) return false

    writeBrowserStorageJson('local', getPairingDeviceStorageKey(pairingId), {
        publicKey: identity.publicKey,
        store: DEVICE_KEY_INDEX_STORE,
        version: DEVICE_KEY_INDEX_VERSION,
    })
    return true
}

function readLegacyIdentity(pairingId: string, strict: boolean): LegacyPairingDeviceIdentity | null {
    const key = getPairingDeviceStorageKey(pairingId)
    const raw = strict ? readBrowserStorageItemOrThrow('local', key) : readBrowserStorageItem('local', key)
    if (!raw) return null
    try {
        const parsed = JSON.parse(raw) as unknown
        if (isLegacyIdentity(parsed)) return parsed
    } catch {
        // Invalid legacy records are removed below.
    }
    removeBrowserStorageItem('local', key)
    return null
}

async function importLegacyIdentity(pairingId: string, strict = false): Promise<PairingDeviceIdentity | null> {
    const legacy = readLegacyIdentity(pairingId, strict)
    if (!legacy) return null

    const privateKey = await crypto.subtle.importKey(
        'jwk',
        legacy.privateKeyJwk,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['sign']
    )
    const identity = { privateKey, publicKey: legacy.publicKey }
    await storeIdentity(pairingId, identity)
    return identity
}

async function readIndexedIdentity(pairingId: string, strict: boolean): Promise<PairingDeviceIdentity | null> {
    const readRecord = strict ? readAppCacheRecordOrThrow : readAppCacheRecord
    const record = await readRecord(APP_CACHE_STORES.pairingDeviceKeys, pairingId)
    if (!record) return null
    if (typeof record.publicKey === 'string' && isPairingPrivateKey(record.privateKey)) {
        return { privateKey: record.privateKey, publicKey: record.publicKey }
    }
    await removeAppCacheRecord(APP_CACHE_STORES.pairingDeviceKeys, pairingId)
    return null
}

async function readCachedIdentity(pairingId: string, strict = false): Promise<PairingDeviceIdentity | null> {
    try {
        const indexed = await readIndexedIdentity(pairingId, strict)
        if (indexed) return indexed
    } catch (error) {
        const legacy = await importLegacyIdentity(pairingId, strict)
        if (legacy) return legacy
        throw error
    }
    return await importLegacyIdentity(pairingId, strict)
}

async function createIdentity(pairingId: string): Promise<PairingDeviceIdentity> {
    const keyPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify'])
    const publicKey = await crypto.subtle.exportKey('spki', keyPair.publicKey)
    const identity = {
        privateKey: keyPair.privateKey,
        publicKey: encodeBase64Url(new Uint8Array(publicKey)),
    }
    if (!(await storeIdentity(pairingId, identity))) {
        throw new Error('Pairing device key storage unavailable')
    }
    return identity
}

export async function loadCachedPairingDeviceIdentity(pairingId: string): Promise<PairingDeviceIdentity | null> {
    return await readCachedIdentity(pairingId, true)
}

export async function loadPairingDeviceIdentity(pairingId: string): Promise<PairingDeviceIdentity> {
    return (await readCachedIdentity(pairingId)) ?? (await createIdentity(pairingId))
}

export async function createReconnectDeviceProof(
    pairingId: string,
    identity: PairingDeviceIdentity,
    challengeNonce: string
): Promise<NonNullable<PairingReconnectRequest['deviceProof']>> {
    const signedAt = Date.now()
    const signature = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        identity.privateKey,
        toArrayBuffer(createProofPayload(pairingId, challengeNonce, signedAt))
    )

    return {
        publicKey: identity.publicKey,
        challengeNonce,
        signedAt,
        signature: encodeBase64Url(new Uint8Array(signature)),
    }
}

export async function clearPairingDeviceIdentity(pairingId: string): Promise<void> {
    removeBrowserStorageItem('local', getPairingDeviceStorageKey(pairingId))
    await removeAppCacheRecord(APP_CACHE_STORES.pairingDeviceKeys, pairingId)
}
