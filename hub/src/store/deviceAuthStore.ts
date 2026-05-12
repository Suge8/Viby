import type { Database } from 'bun:sqlite'
import { createHash, randomUUID } from 'node:crypto'
import type { DeviceChannel, DevicePlatform } from '@viby/protocol/deviceAuth'

export type StoredDeviceAuth = {
    id: string
    name: string | null
    platform: DevicePlatform | null
    channel: DeviceChannel | null
    createdAt: number
    lastSeenAt: number
    revokedAt: number | null
}

type DeviceAuthRow = {
    id: string
    name: string | null
    platform: string | null
    channel: string | null
    token_hash: string
    created_at: number
    last_seen_at: number
    revoked_at: number | null
}

function hashSecret(secret: string): string {
    return createHash('sha256').update(secret, 'utf8').digest('hex')
}

function toStoredDevice(row: DeviceAuthRow): StoredDeviceAuth {
    return {
        id: row.id,
        name: row.name,
        platform: (row.platform as DevicePlatform | null) ?? null,
        channel: (row.channel as DeviceChannel | null) ?? null,
        createdAt: row.created_at,
        lastSeenAt: row.last_seen_at,
        revokedAt: row.revoked_at,
    }
}

export type DeviceUpsertInput = {
    name?: string | null
    platform?: DevicePlatform | null
    channel: DeviceChannel
    now?: number
}

export class DeviceAuthStore {
    constructor(private readonly db: Database) {}

    bindDevice(input: DeviceUpsertInput & { secret: string }): StoredDeviceAuth {
        const now = input.now ?? Date.now()
        const id = randomUUID()
        this.db
            .query(`
            INSERT INTO device_auth_devices (id, name, platform, channel, token_hash, created_at, last_seen_at, revoked_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
        `)
            .run(id, input.name ?? null, input.platform ?? null, input.channel, hashSecret(input.secret), now, now)
        return this.getDevice(id)!
    }

    /**
     * Register or refresh a scan-channel pairing device row. ON CONFLICT no
     * longer clears `revoked_at`: revoke is the user's explicit decision and
     * presence heartbeats must not silently undo it. Scan-device revoke walks
     * `deletePairingDevice` (hard delete) so the conflict case never sees a
     * tombstoned row in practice.
     */
    bindPairingDevice(input: DeviceUpsertInput & { pairingId: string }): StoredDeviceAuth | null {
        const now = input.now ?? Date.now()
        const id = `pairing:${input.pairingId}`
        this.db
            .query(`
            INSERT INTO device_auth_devices (id, name, platform, channel, token_hash, created_at, last_seen_at, revoked_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                platform = COALESCE(excluded.platform, device_auth_devices.platform),
                channel = excluded.channel,
                last_seen_at = excluded.last_seen_at
            WHERE device_auth_devices.revoked_at IS NULL
        `)
            .run(id, input.name ?? null, input.platform ?? null, input.channel, hashSecret(id), now, now)
        return this.getDevice(id)
    }

    /**
     * Register or refresh the "local" machine entry. The owner row uses the
     * caller-supplied anchor (e.g. `local:<ownerId>`) so repeated local logins
     * collapse into a single device rather than creating new rows. `revoked_at`
     * is preserved when set; the owner re-auth path can use it as a soft-disabled
     * signal without being silently undone.
     */
    touchLocalDevice(input: DeviceUpsertInput & { anchorId: string }): StoredDeviceAuth | null {
        const now = input.now ?? Date.now()
        const id = `local:${input.anchorId}`
        this.db
            .query(`
            INSERT INTO device_auth_devices (id, name, platform, channel, token_hash, created_at, last_seen_at, revoked_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
            ON CONFLICT(id) DO UPDATE SET
                name = COALESCE(excluded.name, device_auth_devices.name),
                platform = COALESCE(excluded.platform, device_auth_devices.platform),
                channel = excluded.channel,
                last_seen_at = excluded.last_seen_at
            WHERE device_auth_devices.revoked_at IS NULL
        `)
            .run(id, input.name ?? null, input.platform ?? null, input.channel, hashSecret(id), now, now)
        return this.getDevice(id)
    }

    verifyDevice(id: string, secret: string, now = Date.now()): StoredDeviceAuth | null {
        const row = this.db.query('SELECT * FROM device_auth_devices WHERE id = ?').get(id) as DeviceAuthRow | undefined
        if (!row || row.revoked_at !== null || row.token_hash !== hashSecret(secret)) return null
        this.db.query('UPDATE device_auth_devices SET last_seen_at = ? WHERE id = ?').run(now, id)
        return this.getDevice(id)
    }

    getDevice(id: string): StoredDeviceAuth | null {
        const row = this.db.query('SELECT * FROM device_auth_devices WHERE id = ?').get(id) as DeviceAuthRow | undefined
        return row ? toStoredDevice(row) : null
    }

    listDevices(): StoredDeviceAuth[] {
        const rows = this.db
            .query('SELECT * FROM device_auth_devices ORDER BY last_seen_at DESC')
            .all() as DeviceAuthRow[]
        return rows.map(toStoredDevice)
    }

    /**
     * Soft-revoke a device. Used by `link` / `local` channels where the row
     * acts as a long-lived credential record. Scan-channel devices go through
     * `deletePairingDevice` instead.
     */
    revokeDevice(id: string, now = Date.now()): boolean {
        const result = this.db
            .query('UPDATE device_auth_devices SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL')
            .run(now, id)
        return result.changes === 1
    }

    /**
     * Hard-delete a pairing scan device. There is no reconnect secret to
     * preserve, no audit need to retain tombstone, and downstream consumers
     * (presence tracker, broker pairing session) treat absence as the only
     * truth. Returns true when a row was removed.
     */
    deletePairingDevice(id: string): boolean {
        const result = this.db.query('DELETE FROM device_auth_devices WHERE id = ?').run(id)
        return result.changes >= 1
    }
}
