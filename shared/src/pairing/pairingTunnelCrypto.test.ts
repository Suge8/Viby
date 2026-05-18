import { describe, expect, it } from 'bun:test'
import { createPairingTunnelCipher } from './pairingTunnelCrypto'

describe('pairing tunnel crypto', () => {
    it('seals relay frames so only the peer cipher can read payloads', async () => {
        const host = await createPairingTunnelCipher()
        const guest = await createPairingTunnelCipher()

        await host.receivePeerKey(guest.publicKey)
        await guest.receivePeerKey(host.publicKey)

        const sealed = await guest.seal({
            kind: 'message',
            id: 'frame-1',
            seq: 1,
            payload: { kind: 'heartbeat' },
        })

        expect(sealed.kind).toBe('sealed')
        expect(sealed.ciphertext).not.toContain('heartbeat')
        await expect(host.open(sealed)).resolves.toEqual({
            kind: 'message',
            id: 'frame-1',
            seq: 1,
            payload: { kind: 'heartbeat' },
        })
    })

    it('refuses to seal before peer keys are exchanged', async () => {
        const host = await createPairingTunnelCipher()

        await expect(
            host.seal({
                kind: 'message',
                id: 'frame-1',
                seq: 1,
                payload: { kind: 'heartbeat' },
            })
        ).rejects.toThrow('pairing tunnel cipher is not ready')
    })

    it('rejects ciphertext from a third peer', async () => {
        const host = await createPairingTunnelCipher()
        const guest = await createPairingTunnelCipher()
        const attacker = await createPairingTunnelCipher()

        await host.receivePeerKey(guest.publicKey)
        await guest.receivePeerKey(host.publicKey)
        await attacker.receivePeerKey(guest.publicKey)

        const sealed = await attacker.seal({
            kind: 'message',
            id: 'frame-1',
            seq: 1,
            payload: { kind: 'heartbeat' },
        })

        await expect(host.open(sealed)).rejects.toThrow()
    })

    it('round-trips heartbeat ack frames without exposing route telemetry to the broker', async () => {
        const host = await createPairingTunnelCipher()
        const guest = await createPairingTunnelCipher()

        await host.receivePeerKey(guest.publicKey)
        await guest.receivePeerKey(host.publicKey)

        const sealed = await host.seal({
            kind: 'heartbeat-ack',
            id: 'ack-1',
            seq: 2,
            route: 'relay',
            sentAt: 10,
            receivedAt: 25,
        })

        expect(sealed.ciphertext).not.toContain('relay')
        await expect(guest.open(sealed)).resolves.toMatchObject({
            kind: 'heartbeat-ack',
            route: 'relay',
            sentAt: 10,
            receivedAt: 25,
        })
    })
})
