import { describe, expect, it, mock } from 'bun:test'
import type { PairingSessionSnapshot } from '@/types'
import { PAIRING_STALE_MESSAGE } from './pairingBridgeRecovery'
import { createPairingBridgeStateController } from './pairingBridgeState'

function snapshot(): PairingSessionSnapshot {
    return {
        id: 'pairing-1',
        state: 'claimed',
        createdAt: 1,
        updatedAt: 1,
        expiresAt: 2,
        ticketExpiresAt: 2,
        shortCode: null,
        approvalStatus: 'approved',
        host: {},
        guest: { label: 'Phone' },
    }
}

describe('pairingBridgeState', () => {
    it('keeps live data-channel transport as ready when lower signal layers flap', () => {
        const onStateChange = mock(() => undefined)
        const controller = createPairingBridgeStateController({
            initialPairing: snapshot(),
            isDisposed: () => false,
            isLiveTransport: () => true,
            onStateChange,
        })

        controller.setState({ phase: 'ready', message: '设备链路已接通。' })
        controller.setState({ phase: 'connecting', message: '等待设备接入。' })
        controller.setState({ phase: 'paused', message: '设备链路暂时中断，正在自动接回。' })

        expect(onStateChange).toHaveBeenLastCalledWith(
            expect.objectContaining({ phase: 'ready', message: '设备链路已接通。' })
        )
    })

    it('does not let transient updates overwrite terminal stale pairing state', () => {
        const onStateChange = mock(() => undefined)
        const controller = createPairingBridgeStateController({
            initialPairing: snapshot(),
            isDisposed: () => false,
            isLiveTransport: () => false,
            onStateChange,
        })

        controller.setState({ phase: 'error', message: PAIRING_STALE_MESSAGE })
        controller.setState({ phase: 'connecting', message: '正在建立点对点链路。' })

        expect(onStateChange).toHaveBeenLastCalledWith(
            expect.objectContaining({ phase: 'error', message: PAIRING_STALE_MESSAGE })
        )
    })
})
