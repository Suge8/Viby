import { describe, expect, it } from 'bun:test'
import { PairingSessionRecordSchema } from '@viby/protocol/pairing'
import { createParticipantRecord } from './httpSupport'
import {
    addPairingRemoteConnection,
    approvePairingSession,
    deletePairingSession,
    expirePairingSessionIfNeeded,
    renewPairingSession,
} from './pairingSessionTransition'

function createAuthorizedDevice(guest: ReturnType<typeof createParticipantRecord>, at: number) {
    return {
        id: guest.publicKey ?? guest.tokenHash,
        publicKey: guest.publicKey ?? guest.tokenHash,
        label: guest.label,
        metadata: guest.metadata,
        authorizedAt: at,
        lastSeenAt: at,
    }
}

function createConnection(participant: ReturnType<typeof createParticipantRecord>) {
    return { connectionId: participant.tokenHash, participant }
}

function createSessionRecord(now: number, shortCode = '123456') {
    return PairingSessionRecordSchema.parse({
        id: 'pairing-transition-1',
        state: 'waiting',
        createdAt: now,
        updatedAt: now,
        expiresAt: now + 1_000,
        shortCode,
        approvalStatus: null,
        host: createParticipantRecord({ token: 'host-secret', label: 'Host device' }),
        authorizedDevice: null,
    })
}

describe('pairingSessionTransition', () => {
    it('approves a matching verify code and emits guest token plus remote connection ops', () => {
        const session = createSessionRecord(1_000, '654321')
        const guest = createParticipantRecord({ token: 'guest-secret', label: 'Phone' })
        const transition = approvePairingSession({
            session,
            providedCode: '654321',
            device: createAuthorizedDevice(guest, 1_100),
            connection: createConnection(guest),
            at: 1_100,
        })

        expect(transition?.nextSession).toMatchObject({ approvalStatus: 'approved', state: 'active' })
        expect(transition?.tokenIndexOps).toEqual([
            {
                type: 'set',
                tokenHash: guest.tokenHash,
                value: { connectionId: guest.tokenHash, pairingId: session.id, role: 'guest' },
            },
        ])
        expect(transition?.remoteConnectionOps).toEqual([
            { type: 'replace-all', connection: expect.objectContaining({ tokenHash: guest.tokenHash }) },
        ])
    })

    it('rejects invalid approval without side effects', () => {
        const session = createSessionRecord(1_000, '654321')
        const guest = createParticipantRecord({ token: 'guest-secret', label: 'Phone' })

        expect(
            approvePairingSession({
                session,
                providedCode: '000000',
                device: createAuthorizedDevice(guest, 1_100),
                connection: createConnection(guest),
                at: 1_100,
            })
        ).toBeNull()
    })

    it('adds a replacement remote connection for an approved device', () => {
        const session = createSessionRecord(1_000, '654321')
        const guest = createParticipantRecord({ token: 'guest-secret', label: 'Phone' })
        const approved = approvePairingSession({
            session,
            providedCode: '654321',
            device: createAuthorizedDevice(guest, 1_100),
            connection: createConnection(guest),
            at: 1_100,
        })!.nextSession
        const pwaGuest = createParticipantRecord({ token: 'pwa-secret', label: 'PWA' })

        const transition = addPairingRemoteConnection({
            session: approved,
            connection: createConnection(pwaGuest),
            at: 1_200,
        })

        expect(transition?.nextSession.authorizedDevice?.lastSeenAt).toBe(1_200)
        expect(transition?.remoteConnectionOps).toEqual([
            { type: 'clear-all', pairingId: session.id },
            { type: 'replace-all', connection: expect.objectContaining({ tokenHash: pwaGuest.tokenHash }) },
        ])
    })

    it('expires a session and emits cleanup side effects', () => {
        const session = createSessionRecord(1_000)
        const guest = createParticipantRecord({ token: 'guest-secret', label: 'Phone' })
        const remoteConnection = {
            id: 'conn-1',
            connectionId: 'conn-1',
            pairingId: session.id,
            deviceId: 'device-1',
            tokenHash: guest.tokenHash,
            channel: 'tunnel' as const,
            createdAt: 1_100,
            lastSeenAt: 1_100,
        }

        const transition = expirePairingSessionIfNeeded(session, [remoteConnection], session.expiresAt + 1)

        expect(transition?.nextSession.state).toBe('expired')
        expect(transition?.tokenIndexOps).toContainEqual({ type: 'delete', tokenHash: session.host.tokenHash })
        expect(transition?.tokenIndexOps).toContainEqual({ type: 'delete', tokenHash: guest.tokenHash })
        expect(transition?.remoteConnectionOps).toEqual([{ type: 'clear-all', pairingId: session.id }])
        expect(transition?.transientOps).toEqual([{ type: 'clear-all', pairingId: session.id }])
    })

    it('renews only active sessions', () => {
        const session = createSessionRecord(1_000)

        expect(renewPairingSession(session, 10_000, 1_500)?.nextSession).toMatchObject({
            expiresAt: 10_000,
            updatedAt: 1_500,
        })
        expect(renewPairingSession({ ...session, state: 'expired' }, 10_000, 1_500)).toBeNull()
    })

    it('deletes a session and emits full cleanup side effects', () => {
        const session = createSessionRecord(1_000)
        const transition = deletePairingSession(session, [], 1_500)

        expect(transition.nextSession.state).toBe('deleted')
        expect(transition.tokenIndexOps).toEqual([{ type: 'delete', tokenHash: session.host.tokenHash }])
        expect(transition.remoteConnectionOps).toEqual([{ type: 'clear-all', pairingId: session.id }])
        expect(transition.transientOps).toEqual([{ type: 'clear-all', pairingId: session.id }])
    })
})
