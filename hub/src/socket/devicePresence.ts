/**
 * Tracks link/local device IDs with a live socket owner. Scan (`pairing:*`)
 * presence is derived from desktop bridge phase and never registered here.
 */
export class DevicePresenceTracker {
    private readonly ownersByDevice = new Map<string, Set<string>>()

    add(deviceId: string | undefined, ownerKey: string): boolean {
        if (!deviceId || deviceId.startsWith('pairing:')) return false
        const owners = this.ownersByDevice.get(deviceId) ?? new Set<string>()
        owners.add(ownerKey)
        this.ownersByDevice.set(deviceId, owners)
        return true
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
