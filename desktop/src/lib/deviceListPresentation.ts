import type { DeviceAuthDevice } from '@/lib/deviceAuthSummary'
import type { DesktopPairingSession, PairingRemoteConnectionSnapshot } from '@/types'

export type PresentedDevice = DeviceAuthDevice & {
    remoteConnections?: PairingRemoteConnectionSnapshot[]
}

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

function onlineRemoteConnections(
    remoteConnections: readonly PairingRemoteConnectionSnapshot[] | undefined
): PairingRemoteConnectionSnapshot[] {
    return remoteConnections?.filter((connection) => connection.connectedAt !== undefined) ?? []
}

function presentPairingDevice(session: DesktopPairingSession): PresentedDevice {
    const remoteConnections = onlineRemoteConnections(session.pairing.remoteConnections)
    const guest = session.pairing.guest
    return {
        id: pairingDeviceId(session.pairing.id),
        name: guest?.label ?? null,
        platform: normalizePlatform(guest?.metadata?.platform),
        channel: 'scan',
        createdAt: session.pairing.createdAt,
        lastSeenAt: guest?.lastSeenAt ?? session.pairing.updatedAt,
        revokedAt: null,
        active: remoteConnections.length > 0,
        remoteConnections,
    }
}

export function buildDevicePresentation(
    _devices: DeviceAuthDevice[],
    pairings: readonly DesktopPairingSession[]
): PresentedDevice[] {
    const rows = new Map<string, PresentedDevice>()
    for (const session of pairings) {
        // A pairing surfaces as a device row only after the broker owner
        // reports at least one remote window for that guest device.
        const paired = onlineRemoteConnections(session.pairing.remoteConnections).length > 0
        if (!paired) continue
        const id = pairingDeviceId(session.pairing.id)
        rows.set(id, presentPairingDevice(session))
    }
    return [...rows.values()]
}

function isDeviceConnected(device: PresentedDevice): boolean {
    if (device.revokedAt !== null) return false
    if (device.channel !== 'scan') return device.active
    return (device.remoteConnections?.length ?? 0) > 0
}

export function getConnectedDevices(devices: PresentedDevice[]): PresentedDevice[] {
    return devices.filter(isDeviceConnected)
}
