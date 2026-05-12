import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readBrowserStorageItem, writeBrowserStorageItem } from '@/lib/browserStorage'
import { readAppCacheRecord, writeAppCacheRecord } from '@/lib/storage/appCacheDb'
import { APP_CACHE_STORES, getPairingDeviceStorageKey } from '@/lib/storage/storageRegistry'
import {
    clearPairingDeviceIdentity,
    createReconnectDeviceProof,
    loadCachedPairingDeviceIdentity,
    loadPairingDeviceIdentity,
} from './remotePairingDevice'

const publicKey = {} as CryptoKey
const privateKey = createMockPrivateKey()
const importedPrivateKey = createMockPrivateKey()
const privateKeyJwk = { kty: 'EC', crv: 'P-256', d: 'd-value' }

function createMockPrivateKey(): CryptoKey {
    return {
        algorithm: { name: 'ECDSA', namedCurve: 'P-256' },
        extractable: false,
        type: 'private',
        usages: ['sign'],
    } as CryptoKey
}

function toArrayBuffer(bytes: number[]): ArrayBuffer {
    return new Uint8Array(bytes).buffer
}

function installCrypto() {
    const generateKey = vi.fn(async () => ({ publicKey, privateKey }))
    const exportKey = vi.fn(async (format: string, key: CryptoKey) => {
        if (format === 'spki' && key === publicKey) {
            return toArrayBuffer([1, 2, 3])
        }
        throw new Error('unexpected export')
    })
    const importKey = vi.fn(async () => importedPrivateKey)
    const sign = vi.fn(async () => toArrayBuffer([4, 5, 6]))

    vi.stubGlobal('crypto', {
        subtle: {
            generateKey,
            exportKey,
            importKey,
            sign,
        },
    })

    return { generateKey, exportKey, importKey, sign }
}

beforeEach(() => {
    window.localStorage.clear()
})

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('remotePairingDevice', () => {
    it('loads a cached non-extractable device key from IndexedDB', async () => {
        await writeAppCacheRecord(APP_CACHE_STORES.pairingDeviceKeys, 'pairing-1', {
            createdAt: 1,
            privateKey,
            publicKey: 'cached-public-key',
        })
        const cryptoMocks = installCrypto()

        await expect(loadCachedPairingDeviceIdentity('pairing-1')).resolves.toEqual({
            privateKey: expect.objectContaining({ type: 'private' }),
            publicKey: 'cached-public-key',
        })

        expect(cryptoMocks.generateKey).not.toHaveBeenCalled()
        expect(cryptoMocks.importKey).not.toHaveBeenCalled()
    })

    it('migrates a legacy localStorage device secret into IndexedDB', async () => {
        writeBrowserStorageItem(
            'local',
            getPairingDeviceStorageKey('pairing-1'),
            JSON.stringify({ publicKey: 'cached-public-key', privateKeyJwk })
        )
        const cryptoMocks = installCrypto()

        await expect(loadPairingDeviceIdentity('pairing-1')).resolves.toEqual({
            privateKey: importedPrivateKey,
            publicKey: 'cached-public-key',
        })

        expect(cryptoMocks.generateKey).not.toHaveBeenCalled()
        expect(cryptoMocks.importKey).toHaveBeenCalledWith(
            'jwk',
            privateKeyJwk,
            { name: 'ECDSA', namedCurve: 'P-256' },
            false,
            ['sign']
        )
        expect(JSON.parse(readBrowserStorageItem('local', getPairingDeviceStorageKey('pairing-1')) ?? '{}')).toEqual({
            publicKey: 'cached-public-key',
            store: 'indexeddb',
            version: 1,
        })
        await expect(readAppCacheRecord(APP_CACHE_STORES.pairingDeviceKeys, 'pairing-1')).resolves.toMatchObject({
            publicKey: 'cached-public-key',
        })
    })

    it('returns null for device recovery when no cached identity exists', async () => {
        const cryptoMocks = installCrypto()

        await expect(loadCachedPairingDeviceIdentity('pairing-1')).resolves.toBeNull()

        expect(cryptoMocks.generateKey).not.toHaveBeenCalled()
    })

    it('creates and stores a new non-extractable ECDSA device key when no cache exists', async () => {
        const cryptoMocks = installCrypto()

        const identity = await loadPairingDeviceIdentity('pairing-1')

        expect(identity).toEqual({
            privateKey,
            publicKey: 'AQID',
        })
        expect(cryptoMocks.generateKey).toHaveBeenCalledWith({ name: 'ECDSA', namedCurve: 'P-256' }, false, [
            'sign',
            'verify',
        ])
        expect(cryptoMocks.exportKey).toHaveBeenCalledWith('spki', publicKey)
        expect(readBrowserStorageItem('local', getPairingDeviceStorageKey('pairing-1'))).toBe(
            JSON.stringify({ publicKey: 'AQID', store: 'indexeddb', version: 1 })
        )
        await expect(readAppCacheRecord(APP_CACHE_STORES.pairingDeviceKeys, 'pairing-1')).resolves.toMatchObject({
            publicKey: 'AQID',
        })
    })

    it('replaces invalid cached identity data with a fresh identity', async () => {
        writeBrowserStorageItem('local', getPairingDeviceStorageKey('pairing-1'), JSON.stringify({ publicKey: 1 }))
        const cryptoMocks = installCrypto()

        const identity = await loadPairingDeviceIdentity('pairing-1')

        expect(identity.publicKey).toBe('AQID')
        expect(cryptoMocks.generateKey).toHaveBeenCalledTimes(1)
    })

    it('replaces cached identities that cannot sign reconnect proofs', async () => {
        await writeAppCacheRecord(APP_CACHE_STORES.pairingDeviceKeys, 'pairing-1', {
            createdAt: 1,
            privateKey: {
                algorithm: { name: 'ECDSA', namedCurve: 'P-256' },
                extractable: true,
                type: 'public',
                usages: ['verify'],
            } as CryptoKey,
            publicKey: 'cached-public-key',
        })
        const cryptoMocks = installCrypto()

        const identity = await loadPairingDeviceIdentity('pairing-1')

        expect(identity).toEqual({ publicKey: 'AQID', privateKey })
        expect(cryptoMocks.generateKey).toHaveBeenCalledTimes(1)
    })

    it('signs reconnect challenges with the stored private key and canonical payload', async () => {
        const cryptoMocks = installCrypto()
        const identity = {
            privateKey,
            publicKey: 'cached-public-key',
        }

        const proof = await createReconnectDeviceProof('pairing-1', identity, 'nonce-1')

        expect(proof).toEqual({
            publicKey: 'cached-public-key',
            challengeNonce: 'nonce-1',
            signedAt: expect.any(Number),
            signature: 'BAUG',
        })
        expect(cryptoMocks.importKey).not.toHaveBeenCalled()
        const signCalls = cryptoMocks.sign.mock.calls as unknown as [unknown, unknown, BufferSource][]
        const signPayload = signCalls[0]?.[2]
        expect(signCalls[0]?.[1]).toBe(privateKey)
        expect(new TextDecoder().decode(signPayload)).toBe(`pairing-1:nonce-1:${proof.signedAt}`)
    })

    it('clears the pairing device identity through the storage owner', async () => {
        writeBrowserStorageItem('local', getPairingDeviceStorageKey('pairing-1'), JSON.stringify({ publicKey: 'x' }))
        await writeAppCacheRecord(APP_CACHE_STORES.pairingDeviceKeys, 'pairing-1', {
            createdAt: 1,
            privateKey,
            publicKey: 'cached-public-key',
        })

        await clearPairingDeviceIdentity('pairing-1')

        expect(readBrowserStorageItem('local', getPairingDeviceStorageKey('pairing-1'))).toBeNull()
        await expect(readAppCacheRecord(APP_CACHE_STORES.pairingDeviceKeys, 'pairing-1')).resolves.toBeNull()
    })
})
