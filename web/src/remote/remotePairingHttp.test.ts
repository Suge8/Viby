import type { PairingSessionSnapshot } from '@viby/protocol'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readBrowserStorageItem } from '@/lib/browserStorage'
import { getPairingGuestTokenStorageKey, LOCAL_STORAGE_KEYS } from '@/lib/storage/storageRegistry'
import {
    claimRemotePairing,
    claimRemotePwaHandoff,
    clearRemotePairingId,
    clearStoredGuestToken,
    createRemotePwaHandoff,
    getGuestToken,
    getPairingHandoffTicketFromLocation,
    getPairingTicketFromLocation,
    readRemotePairingId,
    reconnectRemotePairing,
    recoverRemotePairingByDevice,
    rememberRemotePairingId,
    scrubPairingLaunchSecretFromUrl,
    verifyRemotePairingCode,
} from './remotePairingHttp'

const deviceProof = {
    publicKey: 'phone-public-key',
    challengeNonce: 'nonce-1',
    signedAt: 1_700_000_000_000,
    signature: 'signature-1',
}

vi.mock('@/remote/remotePairingDevice', () => ({
    loadCachedPairingDeviceIdentity: vi.fn(async () => ({ publicKey: 'phone-public-key', privateKeyJwk: {} })),
    loadPairingDeviceIdentity: vi.fn(async () => ({ publicKey: 'phone-public-key', privateKeyJwk: {} })),
    createReconnectDeviceProof: vi.fn(async () => deviceProof),
}))

function pairingSnapshot(overrides: Partial<PairingSessionSnapshot> = {}): PairingSessionSnapshot {
    return {
        id: 'pairing-1',
        state: 'claimed' as const,
        createdAt: 1,
        updatedAt: 2,
        expiresAt: 3,
        ticketExpiresAt: 4,
        shortCode: null,
        approvalStatus: 'pending' as const,
        host: { label: 'Desktop' },
        guest: { label: 'Device' },
        ...overrides,
    }
}

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    })
}

function installFetch(responses: Response[]): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn(async () => {
        const response = responses.shift()
        if (!response) {
            throw new Error('unexpected fetch')
        }
        return response
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
}

beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    window.history.replaceState({}, '', '/p/pairing-1#ticket=ticket-1')
})

afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

describe('remotePairingHttp', () => {
    it('reads and removes one-time launch secrets from the URL without touching the path', () => {
        expect(getPairingTicketFromLocation()).toBe('ticket-1')

        scrubPairingLaunchSecretFromUrl()

        expect(window.location.pathname).toBe('/p/pairing-1')
        expect(window.location.hash).toBe('')

        // New PWA installs deliver the handoff in the URL query because iOS
        // WebKit standalone PWAs strip the launch URL fragment on cold start;
        // query takes precedence over the back-compat fragment path.
        window.history.replaceState({}, '', '/p/pairing-1?handoff=query-handoff&keep=1#handoff=legacy-fragment-handoff')
        expect(getPairingHandoffTicketFromLocation()).toBe('query-handoff')

        scrubPairingLaunchSecretFromUrl()

        expect(window.location.pathname).toBe('/p/pairing-1')
        expect(window.location.search).toBe('?keep=1')
        expect(window.location.hash).toBe('')
    })

    it('persists the active pairing id but only restores from explicit remote workspace URLs', () => {
        expect(readRemotePairingId('/p/pairing-2')).toBe('pairing-2')

        rememberRemotePairingId('pairing-3')
        expect(readRemotePairingId('/sessions')).toBeNull()
        expect(readRemotePairingId('/sessions', '?remote=1')).toBe('pairing-3')
        expect(readBrowserStorageItem('local', LOCAL_STORAGE_KEYS.remoteActivePairing)).toBe('pairing-3')

        clearRemotePairingId()
        expect(readRemotePairingId('/sessions', '?remote=1')).toBeNull()
        expect(readBrowserStorageItem('local', LOCAL_STORAGE_KEYS.remoteActivePairing)).toBeNull()
    })

    it('claims a fresh ticket, sends the device public key, and stores the guest token', async () => {
        const fetchMock = installFetch([
            jsonResponse({
                pairing: pairingSnapshot(),
                guestToken: 'guest-token-1',
                wsUrl: 'wss://pair.example/ws',
                iceServers: [{ urls: 'stun:stun.example.com:3478' }],
            }),
        ])

        const response = await claimRemotePairing('pairing-1', 'ticket-1')

        expect(response.guestToken).toBe('guest-token-1')
        expect(readBrowserStorageItem('local', getPairingGuestTokenStorageKey('pairing-1'))).toBe('guest-token-1')
        expect(fetchMock).toHaveBeenCalledWith(
            '/pairings/pairing-1/claim',
            expect.objectContaining({
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    ticket: 'ticket-1',
                    label: '设备',
                    publicKey: 'phone-public-key',
                    metadata: { platform: 'unknown' },
                }),
                signal: expect.any(AbortSignal),
            })
        )
    })

    it('verifies the desktop code and returns the approved pairing snapshot', async () => {
        installFetch([
            jsonResponse({
                pairing: pairingSnapshot({ approvalStatus: 'approved', shortCode: '123456' }),
            }),
        ])

        const response = await verifyRemotePairingCode('pairing-1', 'guest-token-1', '123456')

        expect(response.pairing.approvalStatus).toBe('approved')
        expect(response.pairing.shortCode).toBe('123456')
    })

    it('converts broker error payloads into local presentation codes', async () => {
        installFetch([jsonResponse({ code: 'pairing_invalid_code', error: 'server copy is ignored' }, 403)])

        await expect(verifyRemotePairingCode('pairing-1', 'guest-token-1', '000000')).rejects.toMatchObject({
            code: 'remotePairing.error.invalidCode',
            message: 'remotePairing.error.invalidCode',
        })
    })

    it('reconnects with a one-time challenge and signed device proof', async () => {
        window.localStorage.setItem(getPairingGuestTokenStorageKey('pairing-1'), 'guest-token-1')
        const fetchMock = installFetch([
            jsonResponse({ role: 'guest', challenge: { nonce: 'nonce-1', issuedAt: 1, expiresAt: 2 } }),
            jsonResponse({
                pairing: pairingSnapshot({ approvalStatus: 'approved' }),
                role: 'guest',
                wsUrl: 'wss://pair.example/ws',
                iceServers: [{ urls: 'stun:stun.example.com:3478' }],
            }),
        ])

        const response = await reconnectRemotePairing('pairing-1')

        expect(response?.role).toBe('guest')
        expect(fetchMock).toHaveBeenNthCalledWith(
            1,
            '/pairings/pairing-1/reconnect-challenge',
            expect.objectContaining({
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ token: 'guest-token-1' }),
                signal: expect.any(AbortSignal),
            })
        )
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            '/pairings/pairing-1/reconnect',
            expect.objectContaining({
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ token: 'guest-token-1', deviceProof }),
                signal: expect.any(AbortSignal),
            })
        )
    })

    it('clears stale guest tokens only when reconnect proves the token is invalid', async () => {
        window.localStorage.setItem(getPairingGuestTokenStorageKey('pairing-1'), 'guest-token-1')
        installFetch([jsonResponse({ message: 'expired' }, 410)])

        await expect(reconnectRemotePairing('pairing-1')).rejects.toMatchObject({
            code: 'remotePairing.error.scanAgain',
        })

        expect(readBrowserStorageItem('local', getPairingGuestTokenStorageKey('pairing-1'))).toBeNull()
    })

    it('keeps the guest token after transient reconnect failures', async () => {
        window.localStorage.setItem(getPairingGuestTokenStorageKey('pairing-1'), 'guest-token-1')
        installFetch([jsonResponse({ message: 'try again' }, 503)])

        await expect(reconnectRemotePairing('pairing-1')).rejects.toMatchObject({
            code: 'remotePairing.error.fallback',
        })

        expect(readBrowserStorageItem('local', getPairingGuestTokenStorageKey('pairing-1'))).toBe('guest-token-1')
    })

    it('keeps the guest token when a reconnect challenge races or expires', async () => {
        window.localStorage.setItem(getPairingGuestTokenStorageKey('pairing-1'), 'guest-token-1')
        installFetch([
            jsonResponse({ role: 'guest', challenge: { nonce: 'nonce-1', issuedAt: 1, expiresAt: 2 } }),
            jsonResponse(
                { code: 'pairing_reconnect_challenge_expired', error: 'Missing or expired reconnect challenge' },
                403
            ),
        ])

        await expect(reconnectRemotePairing('pairing-1')).rejects.toMatchObject({
            code: 'remotePairing.error.scanAgain',
            serverError: 'Missing or expired reconnect challenge',
            serverCode: 'pairing_reconnect_challenge_expired',
        })

        expect(readBrowserStorageItem('local', getPairingGuestTokenStorageKey('pairing-1'))).toBe('guest-token-1')
    })

    it('returns null when the device has not claimed the pairing yet', async () => {
        expect(await reconnectRemotePairing('pairing-1')).toBeNull()
    })

    it('surfaces localStorage read failures during reconnect instead of returning missing credentials', async () => {
        vi.stubGlobal('localStorage', {
            getItem: () => {
                throw new DOMException('blocked', 'SecurityError')
            },
        })

        await expect(reconnectRemotePairing('pairing-1')).rejects.toMatchObject({
            name: 'BrowserStorageUnavailableError',
        })
    })

    it('recovers a missing guest token with the stored device key', async () => {
        const fetchMock = installFetch([
            jsonResponse({ role: 'guest', challenge: { nonce: 'nonce-1', issuedAt: 1, expiresAt: 2 } }),
            jsonResponse({
                pairing: pairingSnapshot({ approvalStatus: 'approved' }),
                guestToken: 'guest-token-recovered',
                wsUrl: 'wss://pair.example/ws',
                iceServers: [{ urls: 'stun:stun.example.com:3478' }],
            }),
        ])

        const response = await recoverRemotePairingByDevice('pairing-1')

        expect(response?.guestToken).toBe('guest-token-recovered')
        expect(readBrowserStorageItem('local', getPairingGuestTokenStorageKey('pairing-1'))).toBe(
            'guest-token-recovered'
        )
        expect(fetchMock).toHaveBeenNthCalledWith(
            1,
            '/pairings/pairing-1/device-reconnect-challenge',
            expect.objectContaining({ body: JSON.stringify({ publicKey: 'phone-public-key' }) })
        )
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            '/pairings/pairing-1/device-reconnect',
            expect.objectContaining({ body: JSON.stringify({ deviceProof }) })
        )
    })

    it('creates a one-time PWA install handoff ticket from the bound browser credential', async () => {
        window.localStorage.setItem(getPairingGuestTokenStorageKey('pairing-1'), 'guest-token-1')
        const fetchMock = installFetch([
            jsonResponse({ role: 'guest', challenge: { nonce: 'nonce-1', issuedAt: 1, expiresAt: 2 } }),
            jsonResponse({ handoffTicket: 'handoff-ticket-1', expiresAt: 3 }),
        ])

        await expect(createRemotePwaHandoff('pairing-1')).resolves.toEqual({
            handoffTicket: 'handoff-ticket-1',
            expiresAt: 3,
        })
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            '/pairings/pairing-1/pwa-handoff-ticket',
            expect.objectContaining({ body: JSON.stringify({ token: 'guest-token-1', deviceProof }) })
        )
    })

    it('claims a PWA handoff into fresh standalone storage and stores the rotated guest token', async () => {
        const fetchMock = installFetch([
            jsonResponse({
                pairing: pairingSnapshot({ approvalStatus: 'approved' }),
                guestToken: 'guest-token-pwa',
                wsUrl: 'wss://pair.example/ws',
                iceServers: [{ urls: 'stun:stun.example.com:3478' }],
            }),
        ])

        const response = await claimRemotePwaHandoff('pairing-1', 'handoff-ticket-1')

        expect(response.guestToken).toBe('guest-token-pwa')
        expect(readBrowserStorageItem('local', getPairingGuestTokenStorageKey('pairing-1'))).toBe('guest-token-pwa')
        expect(fetchMock).toHaveBeenCalledWith(
            '/pairings/pairing-1/pwa-handoff-claim',
            expect.objectContaining({
                body: JSON.stringify({
                    handoffTicket: 'handoff-ticket-1',
                    label: '设备',
                    publicKey: 'phone-public-key',
                }),
            })
        )
    })

    it('exposes the live guest token for both claim and reconnect auth payloads', () => {
        window.localStorage.setItem(getPairingGuestTokenStorageKey('pairing-1'), 'stored-token')

        expect(
            getGuestToken({
                pairing: pairingSnapshot(),
                guestToken: 'claim-token',
                wsUrl: 'wss://pair.example/ws',
                iceServers: [],
            })
        ).toBe('claim-token')
        expect(
            getGuestToken({
                pairing: pairingSnapshot(),
                role: 'guest',
                wsUrl: 'wss://pair.example/ws',
                iceServers: [],
            })
        ).toBe('stored-token')

        clearStoredGuestToken('pairing-1')
        expect(readBrowserStorageItem('local', getPairingGuestTokenStorageKey('pairing-1'))).toBeNull()
    })
})
