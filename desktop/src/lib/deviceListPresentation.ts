import type { DeviceAuthDevice } from '@/lib/deviceAuthSummary'

export function getConnectedDevices(devices: DeviceAuthDevice[]): DeviceAuthDevice[] {
    return devices.filter((device) => device.revokedAt === null && device.active)
}
