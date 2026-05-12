import { useCallback, useEffect, useState } from 'react'
import { type DeviceAuthSummary, fetchDeviceAuthSummary, revokeDeviceAuthBinding } from '@/lib/deviceAuthSummary'
import type { HubRuntimeStatus } from '@/types'

const DEVICE_SUMMARY_POLL_MS = 3_000

type DeviceAuthSummaryState = DeviceAuthSummary & {
    loaded: boolean
    error: string | null
    revokeDevice(deviceId: string): Promise<void>
}

export type DeviceAuthSummaryOptions = {
    /**
     * Every `pairing:<id>` device id the desktop currently owns. Devices
     * outside this set are scan-channel orphans (history scans, races with
     * a freshly-revoked pairing) and must be hard-deleted on the next poll.
     */
    pairingDeviceIds: ReadonlySet<string>
    /**
     * Wait for the desktop pairings storage read to finish before pruning
     * orphan scan rows. Async hydration on boot must not let the poller wipe
     * legitimate persisted pairings because React state hasn't caught up yet.
     */
    pairingResolved: boolean
}

function isReady(status: HubRuntimeStatus | undefined): status is HubRuntimeStatus {
    return status?.phase === 'ready'
}

function selectOrphanPairingDeviceIds(
    devices: DeviceAuthSummary['devices'],
    ownedPairingDeviceIds: ReadonlySet<string>
): string[] {
    return devices
        .filter((device) => device.channel === 'scan' && !ownedPairingDeviceIds.has(device.id))
        .map((device) => device.id)
}

export function useDeviceAuthSummary(
    status: HubRuntimeStatus | undefined,
    enabled: boolean,
    options: DeviceAuthSummaryOptions
): DeviceAuthSummaryState {
    const [summary, setSummary] = useState<DeviceAuthSummary>({ activeCount: 0, devices: [] })
    const [loaded, setLoaded] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const key = enabled && isReady(status) ? `${status.localHubUrl}|${status.cliApiToken}` : 'idle'
    const ownedIds = options.pairingDeviceIds
    const { pairingResolved } = options

    useEffect(() => {
        if (!enabled || !isReady(status)) {
            setSummary({ activeCount: 0, devices: [] })
            setLoaded(false)
            setError(null)
            return
        }

        const readyStatus = status
        let stopped = false
        let timer: number | null = null
        async function refresh(): Promise<void> {
            try {
                const next = await fetchDeviceAuthSummary(readyStatus)
                if (stopped) return
                setSummary(next)
                setLoaded(true)
                setError(null)

                if (pairingResolved) {
                    const orphans = selectOrphanPairingDeviceIds(next.devices, ownedIds)
                    if (orphans.length > 0) {
                        await Promise.allSettled(
                            orphans.map((deviceId) => revokeDeviceAuthBinding(readyStatus, deviceId))
                        )
                    }
                }
            } catch (error) {
                if (!stopped) {
                    setLoaded(false)
                    setError(String(error))
                }
            }
            if (!stopped) timer = window.setTimeout(() => void refresh(), DEVICE_SUMMARY_POLL_MS)
        }

        void refresh()
        return () => {
            stopped = true
            if (timer !== null) window.clearTimeout(timer)
        }
    }, [enabled, key, status, ownedIds, pairingResolved])

    const revokeDevice = useCallback(
        async (deviceId: string): Promise<void> => {
            if (!isReady(status)) return
            await revokeDeviceAuthBinding(status, deviceId)
            setSummary(await fetchDeviceAuthSummary(status))
            setLoaded(true)
        },
        [key, status]
    )

    return { ...summary, loaded, error, revokeDevice }
}
