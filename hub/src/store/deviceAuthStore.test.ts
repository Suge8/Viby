import { Database } from 'bun:sqlite'
import { describe, expect, it } from 'bun:test'
import { DeviceAuthStore } from './deviceAuthStore'
import { createStoreSchema } from './storeSchemaDefinition'

describe('DeviceAuthStore', () => {
    it('binds, reconnects, and revokes devices', () => {
        const db = new Database(':memory:')
        createStoreSchema(db)
        const store = new DeviceAuthStore(db)
        const device = store.bindDevice({
            secret: 'secret-secret-secret-secret-secret-secret',
            name: 'Phone',
            platform: 'ios',
            channel: 'link',
            now: 1,
        })

        expect(device.platform).toBe('ios')
        expect(device.channel).toBe('link')
        expect(store.verifyDevice(device.id, 'bad-secret')).toBeNull()
        expect(store.verifyDevice(device.id, 'secret-secret-secret-secret-secret-secret', 2)?.lastSeenAt).toBe(2)
        expect(store.listDevices()).toHaveLength(1)
        expect(store.revokeDevice(device.id, 3)).toBe(true)
        expect(store.verifyDevice(device.id, 'secret-secret-secret-secret-secret-secret')).toBeNull()
    })

    it('upserts pairing devices with platform/channel', () => {
        const db = new Database(':memory:')
        createStoreSchema(db)
        const store = new DeviceAuthStore(db)
        const first = store.bindPairingDevice({
            pairingId: 'pairing-1',
            name: 'iPhone',
            platform: 'ios',
            channel: 'scan',
            now: 1,
        })
        expect(first?.id).toBe('pairing:pairing-1')
        expect(first?.platform).toBe('ios')
        expect(first?.channel).toBe('scan')

        const refreshed = store.bindPairingDevice({
            pairingId: 'pairing-1',
            name: 'iPhone',
            platform: 'ios',
            channel: 'scan',
            now: 2,
        })
        expect(refreshed?.lastSeenAt).toBe(2)
        expect(store.listDevices()).toHaveLength(1)
    })

    it('touches local device with anchor-based deduplication', () => {
        const db = new Database(':memory:')
        createStoreSchema(db)
        const store = new DeviceAuthStore(db)
        const first = store.touchLocalDevice({
            anchorId: 'owner-1',
            name: 'Desktop',
            platform: 'macos',
            channel: 'local',
            now: 1,
        })
        expect(first?.id).toBe('local:owner-1')
        expect(first?.platform).toBe('macos')
        expect(first?.channel).toBe('local')

        const refreshed = store.touchLocalDevice({ anchorId: 'owner-1', platform: 'macos', channel: 'local', now: 2 })
        expect(refreshed?.lastSeenAt).toBe(2)
        expect(refreshed?.name).toBe('Desktop')
        expect(store.listDevices()).toHaveLength(1)
    })

    it('deletePairingDevice hard-removes the row so presence cannot resurrect it', () => {
        const db = new Database(':memory:')
        createStoreSchema(db)
        const store = new DeviceAuthStore(db)
        const bound = store.bindPairingDevice({
            pairingId: 'pairing-1',
            name: 'iPhone',
            platform: 'ios',
            channel: 'scan',
            now: 1,
        })
        expect(bound).not.toBeNull()
        expect(store.listDevices()).toHaveLength(1)

        expect(store.deletePairingDevice('pairing:pairing-1')).toBe(true)
        expect(store.listDevices()).toHaveLength(0)
        expect(store.deletePairingDevice('pairing:pairing-1')).toBe(false)
    })

    it('bindPairingDevice does not resurrect a soft-revoked row (defensive)', () => {
        const db = new Database(':memory:')
        createStoreSchema(db)
        const store = new DeviceAuthStore(db)
        store.bindPairingDevice({
            pairingId: 'pairing-1',
            name: 'iPhone',
            channel: 'scan',
            now: 1,
        })
        // simulate a legacy soft-revoke that escaped the v20 purge
        expect(store.revokeDevice('pairing:pairing-1', 5)).toBe(true)

        const reborn = store.bindPairingDevice({
            pairingId: 'pairing-1',
            name: 'iPhone',
            channel: 'scan',
            now: 10,
        })
        expect(reborn?.revokedAt).toBe(5)
        expect(reborn?.lastSeenAt).toBe(1)
    })

    it('touchLocalDevice does not resurrect a soft-revoked owner row', () => {
        const db = new Database(':memory:')
        createStoreSchema(db)
        const store = new DeviceAuthStore(db)
        store.touchLocalDevice({ anchorId: 'owner-1', channel: 'local', now: 1 })
        expect(store.revokeDevice('local:owner-1', 5)).toBe(true)

        const reborn = store.touchLocalDevice({ anchorId: 'owner-1', channel: 'local', now: 10 })
        expect(reborn?.revokedAt).toBe(5)
        expect(reborn?.lastSeenAt).toBe(1)
    })
})
