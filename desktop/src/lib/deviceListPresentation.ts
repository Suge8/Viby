import type { DeviceAuthDevice } from '@/lib/deviceAuthSummary'
import type { DeviceLinkSnapshotMap } from '@/lib/deviceLinkBadge'
import type { DesktopPairingSession } from '@/types'

type KnownDevicePlatform = Exclude<DeviceAuthDevice['platform'], null>

const DEVICE_PLATFORMS = new Set<KnownDevicePlatform>(['ios', 'android', 'macos', 'windows', 'linux', 'unknown'])

function pairingDeviceId(pairingId: string): string {
    return `pairing:${pairingId}`
}

function normalizePlatform(value: unknown): KnownDevicePlatform {
    return typeof value === 'string' && DEVICE_PLATFORMS.has(value as KnownDevicePlatform)
        ? (value as KnownDevicePlatform)
        : 'unknown'
}

function pairingDevice(session: DesktopPairingSession): DeviceAuthDevice {
    const guest = session.pairing.guest
    return {
        id: pairingDeviceId(session.pairing.id),
        name: guest?.label ?? null,
        platform: normalizePlatform(guest?.metadata?.platform),
        channel: 'scan',
        createdAt: session.pairing.createdAt,
        lastSeenAt: guest?.lastSeenAt ?? session.pairing.updatedAt,
        revokedAt: null,
        active: false,
    }
}

export function buildDevicePresentation(
    devices: DeviceAuthDevice[],
    pairings: readonly DesktopPairingSession[],
    bridges: ReadonlyMap<string, { phase: 'connecting' | 'ready' | 'fatal' }>
): DeviceAuthDevice[] {
    const rows = new Map(devices.map((device) => [device.id, device]))
    for (const session of pairings) {
        // A pairing only surfaces as a device row once the bridge sees a
        // real guest heartbeat ack OR the broker confirmed approval through
        // SSE. Either signal proves a guest verified the code; without
        // either the invite has no associated device to display.
        const paired =
            session.pairing.approvalStatus === 'approved' || bridges.get(session.pairing.id)?.phase === 'ready'
        if (!paired) continue
        const id = pairingDeviceId(session.pairing.id)
        rows.set(id, pairingDevice(session))
    }
    return [...rows.values()]
}

function isDeviceConnected(device: DeviceAuthDevice, links: DeviceLinkSnapshotMap): boolean {
    if (device.revokedAt !== null) return false
    if (device.channel !== 'scan') return device.active
    return links.get(device.id)?.phase === 'ready'
}

export function getConnectedDevices(devices: DeviceAuthDevice[], links: DeviceLinkSnapshotMap): DeviceAuthDevice[] {
    return devices.filter((device) => isDeviceConnected(device, links))
}
