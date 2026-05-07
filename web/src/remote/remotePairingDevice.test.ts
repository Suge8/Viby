import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readBrowserStorageItem, writeBrowserStorageItem } from '@/lib/browserStorage'
import { getPairingDeviceStorageKey } from '@/lib/storage/storageRegistry'
import {
    clearPairingDeviceIdentity,
    createReconnectDeviceProof,
    loadPairingDeviceIdentity,
} from './remotePairingDevice'

const publicKey = {} as CryptoKey
const privateKey = {} as CryptoKey
const importedPrivateKey = {} as CryptoKey
const privateKeyJwk = { kty: 'EC', crv: 'P-256', d: 'd-value' }

function toArrayBuffer(bytes: number[]): ArrayBuffer {
    return new Uint8Array(bytes).buffer
}

function installCrypto() {
    const generateKey = vi.fn(async () => ({ publicKey, privateKey }))
    const exportKey = vi.fn(async (format: string, key: CryptoKey) => {
        if (format === 'spki' && key === publicKey) {
            return toArrayBuffer([1, 2, 3])
        }
        if (format === 'jwk' && key === privateKey) {
            return privateKeyJwk
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
    it('loads a cached device identity from the registered browser storage key', async () => {
        const identity = {
            publicKey: 'cached-public-key',
            privateKeyJwk,
        }
        writeBrowserStorageItem('local', getPairingDeviceStorageKey('pairing-1'), JSON.stringify(identity))
        const cryptoMocks = installCrypto()

        await expect(loadPairingDeviceIdentity('pairing-1')).resolves.toEqual(identity)

        expect(cryptoMocks.generateKey).not.toHaveBeenCalled()
    })

    it('creates and stores a new ECDSA device identity when no cache exists', async () => {
        const cryptoMocks = installCrypto()

        const identity = await loadPairingDeviceIdentity('pairing-1')

        expect(identity).toEqual({
            publicKey: 'AQID',
            privateKeyJwk,
        })
        expect(cryptoMocks.generateKey).toHaveBeenCalledWith({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
            'sign',
            'verify',
        ])
        expect(readBrowserStorageItem('local', getPairingDeviceStorageKey('pairing-1'))).toBe(JSON.stringify(identity))
    })

    it('replaces invalid cached identity data with a fresh identity', async () => {
        writeBrowserStorageItem('local', getPairingDeviceStorageKey('pairing-1'), JSON.stringify({ publicKey: 1 }))
        const cryptoMocks = installCrypto()

        const identity = await loadPairingDeviceIdentity('pairing-1')

        expect(identity.publicKey).toBe('AQID')
        expect(cryptoMocks.generateKey).toHaveBeenCalledTimes(1)
    })

    it('signs reconnect challenges with the stored private key and canonical payload', async () => {
        const cryptoMocks = installCrypto()
        const identity = {
            publicKey: 'cached-public-key',
            privateKeyJwk,
        }

        const proof = await createReconnectDeviceProof('pairing-1', identity, 'nonce-1')

        expect(proof).toEqual({
            publicKey: 'cached-public-key',
            challengeNonce: 'nonce-1',
            signedAt: expect.any(Number),
            signature: 'BAUG',
        })
        expect(cryptoMocks.importKey).toHaveBeenCalledWith(
            'jwk',
            privateKeyJwk,
            { name: 'ECDSA', namedCurve: 'P-256' },
            false,
            ['sign']
        )
        const signCalls = cryptoMocks.sign.mock.calls as unknown as [unknown, unknown, BufferSource][]
        const signPayload = signCalls[0]?.[2]
        expect(new TextDecoder().decode(signPayload)).toBe(`pairing-1:nonce-1:${proof.signedAt}`)
    })

    it('clears the pairing device identity through the storage owner', () => {
        writeBrowserStorageItem('local', getPairingDeviceStorageKey('pairing-1'), JSON.stringify({ publicKey: 'x' }))

        clearPairingDeviceIdentity('pairing-1')

        expect(readBrowserStorageItem('local', getPairingDeviceStorageKey('pairing-1'))).toBeNull()
    })
})
