/**
 * Tracks which device IDs currently have a live owner (Socket.IO socket or
 * bridge presence reporter). active = membership of this set; there is no
 * timestamp or TTL fallback.
 */
export class DevicePresenceTracker {
    private readonly ownersByDevice = new Map<string, Set<string>>()

    add(deviceId: string | undefined, ownerKey: string): void {
        if (!deviceId) return
        const owners = this.ownersByDevice.get(deviceId) ?? new Set<string>()
        owners.add(ownerKey)
        this.ownersByDevice.set(deviceId, owners)
    }

    remove(deviceId: string | undefined, ownerKey: string): void {
        if (!deviceId) return
        const owners = this.ownersByDevice.get(deviceId)
        if (!owners) return
        owners.delete(ownerKey)
        if (owners.size === 0) this.ownersByDevice.delete(deviceId)
    }

    activeDeviceIds(): Set<string> {
        return new Set(this.ownersByDevice.keys())
    }
}
