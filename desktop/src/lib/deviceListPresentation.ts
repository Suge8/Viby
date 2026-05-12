import type { DeviceAuthDevice } from '@/lib/deviceAuthSummary'
import type { DeviceLinkSnapshotMap } from '@/lib/deviceLinkBadge'

function isDeviceConnected(device: DeviceAuthDevice, links: DeviceLinkSnapshotMap): boolean {
    if (device.revokedAt !== null) return false
    if (device.channel !== 'scan') return device.active
    return links.get(device.id)?.phase === 'ready'
}

export function getConnectedDevices(devices: DeviceAuthDevice[], links: DeviceLinkSnapshotMap): DeviceAuthDevice[] {
    return devices.filter((device) => isDeviceConnected(device, links))
}
