import type { DesktopPairingSession, PairingBridgeState, PairingSessionSnapshot } from '@/types'

export function describePairingBridgeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}

export function runPairingBridgeTask(
    task: () => Promise<void>,
    options: {
        isDisposed: () => boolean
        onError: (error: unknown) => void
    }
): void {
    task().catch((error) => {
        if (!options.isDisposed()) {
            options.onError(error)
        }
    })
}

export function readSignalPairingSnapshot(payload: unknown): PairingSessionSnapshot | null {
    if (!payload || typeof payload !== 'object' || !('pairing' in payload)) {
        return null
    }

    const pairingValue = payload.pairing
    return pairingValue && typeof pairingValue === 'object' ? (pairingValue as PairingSessionSnapshot) : null
}

export function handleUnsupportedPairingBridgeEnvironment(options: {
    onStateChange: (state: PairingBridgeState) => void
    pairing: DesktopPairingSession
}): (() => void) | null {
    if (typeof RTCPeerConnection !== 'undefined' && typeof WebSocket !== 'undefined') {
        return null
    }

    options.onStateChange({
        phase: 'error',
        message: '当前桌面环境不支持 WebRTC 配对桥接。',
        pairing: options.pairing.pairing,
    })
    return () => {}
}
