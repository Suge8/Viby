import {
    buildPairingDeviceLinkStatus,
    type PairingDeviceLinkBridgeInput,
    type PairingDeviceLinkStatus,
} from '@viby/protocol/pairing'
import type { PairingBridgeState, PairingBridgeStats } from '@/types'
import type { DeviceAuthDevice } from './deviceAuthSummary'

export interface DeviceLinkSnapshot {
    deviceId: string
    phase: PairingBridgeState['phase']
    stats: PairingBridgeStats | null
}

export type DeviceLinkSnapshotMap = ReadonlyMap<string, DeviceLinkSnapshot>

/**
 * Snapshot a single bridge for the `pairing:<id>` device row it owns. Returns
 * `null` when the bridge hasn't yet observed a pairing snapshot.
 */
export function buildDeviceLinkSnapshot(state: PairingBridgeState): DeviceLinkSnapshot | null {
    if (!state.pairing) return null
    return {
        deviceId: `pairing:${state.pairing.id}`,
        phase: state.phase,
        stats: state.stats ?? null,
    }
}

/**
 * Snapshot every active bridge keyed by its `pairing:<id>` device id so the
 * UI list can resolve the live link badge per row.
 */
export function buildDeviceLinkSnapshots(
    bridges: ReadonlyMap<string, PairingBridgeState>
): Map<string, DeviceLinkSnapshot> {
    const snapshots = new Map<string, DeviceLinkSnapshot>()
    for (const [pairingId, state] of bridges) {
        const deviceId = `pairing:${pairingId}`
        snapshots.set(deviceId, {
            deviceId,
            phase: state.phase,
            stats: state.stats ?? null,
        })
    }
    return snapshots
}

function adaptBridgeInput(bridge: DeviceLinkSnapshot): PairingDeviceLinkBridgeInput {
    return {
        phase: bridge.phase,
        stats: bridge.stats
            ? {
                  transport: bridge.stats.transport,
                  currentRoundTripTimeMs: bridge.stats.currentRoundTripTimeMs,
                  previousTransport: bridge.stats.previousTransport ?? null,
              }
            : null,
    }
}

export function buildDeviceLinkStatus(
    device: DeviceAuthDevice,
    bridge: DeviceLinkSnapshot | null
): PairingDeviceLinkStatus {
    const matched = bridge && bridge.deviceId === device.id ? bridge : null
    if (matched?.phase === 'connecting')
        return { phase: 'handshaking', title: '正在握手', tone: 'warning', latencyMs: null }
    if (matched?.phase === 'fatal') return { phase: 'failed', title: '连接中断', tone: 'danger', latencyMs: null }
    return buildPairingDeviceLinkStatus({
        channel: device.channel,
        active: device.channel === 'scan' ? false : device.active,
        bridge: matched ? adaptBridgeInput(matched) : null,
    })
}
