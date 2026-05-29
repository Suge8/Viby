import { describe, expect, it } from 'bun:test'
import { LanPairingSessionStore } from './lanSessionStore'

describe('LanPairingSessionStore', () => {
    it('creates a session with a 6-digit shortCode and owner attribution', () => {
        const store = new LanPairingSessionStore(() => 1_000)
        const session = store.create({ ownerId: 7, label: 'Phone' })

        expect(session.shortCode).toMatch(/^\d{6}$/)
        expect(session.approvalStatus).toBeNull()
        expect(session.guest).toBeNull()
        expect(store.isOwnedBy(session.id, 7)).toBe(true)
        expect(store.isOwnedBy(session.id, 8)).toBe(false)
    })

    it('approves the session atomically when the correct code is provided', () => {
        const store = new LanPairingSessionStore(() => 1_000)
        const session = store.create({ ownerId: 1 })
        const result = store.verifyAndApprove({
            pairingId: session.id,
            code: session.shortCode!,
            label: 'Pixel',
            publicKey: 'spki-key',
        })

        expect(result.status).toBe('ok')
        expect(result.session?.approvalStatus).toBe('approved')
        expect(result.session?.guest?.publicKey).toBe('spki-key')
    })

    it('rejects verify when the code does not match the issued shortCode', () => {
        const store = new LanPairingSessionStore(() => 1_000)
        const session = store.create({ ownerId: 1 })
        const result = store.verifyAndApprove({ pairingId: session.id, code: '000000' })

        expect(result.status).toBe('wrong_code')
        const snapshot = store.getSnapshotForOwner(session.id, 1)
        expect(snapshot?.approvalStatus).toBeNull()
        expect(snapshot?.guest).toBeNull()
    })

    it('rejects a second verify after the session is already approved', () => {
        const store = new LanPairingSessionStore(() => 1_000)
        const session = store.create({ ownerId: 1 })
        store.verifyAndApprove({ pairingId: session.id, code: session.shortCode! })
        const replay = store.verifyAndApprove({ pairingId: session.id, code: session.shortCode! })

        expect(replay.status).toBe('already_approved')
    })

    it('returns expired status once the session lifetime passes', () => {
        let now = 1_000
        const store = new LanPairingSessionStore(() => now)
        const session = store.create({ ownerId: 1 })
        now += 6 * 60 * 1000

        const result = store.verifyAndApprove({ pairingId: session.id, code: session.shortCode! })
        expect(result.status).toBe('expired')
    })

    it('pushes a pairing.updated event to live subscribers when verify succeeds', () => {
        const store = new LanPairingSessionStore(() => 1_000)
        const session = store.create({ ownerId: 1 })
        const captured: unknown[] = []
        const unsubscribe = store.subscribe(session.id, (event) => captured.push(event))

        store.verifyAndApprove({ pairingId: session.id, code: session.shortCode! })

        expect(captured).toHaveLength(1)
        expect(captured[0]).toMatchObject({
            type: 'pairing.updated',
            pairing: { approvalStatus: 'approved', shortCode: session.shortCode },
        })

        unsubscribe()
        store.deleteForOwner(session.id, 1)
        expect(captured).toHaveLength(1) // unsubscribed listener no longer fires
    })

    it('limits delete to the owning user so a foreign caller cannot drop the session', () => {
        const store = new LanPairingSessionStore(() => 1_000)
        const session = store.create({ ownerId: 1 })

        expect(store.deleteForOwner(session.id, 99)).toBeNull()
        expect(store.getSnapshotForOwner(session.id, 1)).not.toBeNull()

        const deleted = store.deleteForOwner(session.id, 1)
        expect(deleted?.state).toBe('deleted')
    })
})
