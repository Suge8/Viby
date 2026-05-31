import {
    createPairingTunnelCipher,
    createPairingUploadChunkFrame,
    fromPairingTunnelBase64Url,
    type PairingTunnelBinaryFrame,
    type PairingTunnelCipher,
} from '@viby/protocol/pairing'

export type ScheduleInterval = (callback: () => void, intervalMs: number) => () => void
export type ScheduleTimeout = (callback: () => void, delayMs: number) => () => void
export type RelaySocket = {
    readyState: number
    onclose: ((event?: { code: number; reason: string }) => void) | null
    onerror: (() => void) | null
    onmessage: ((event: { data: unknown }) => void) | null
    onopen: (() => void) | null
    close(): void
    send(data: string): void
}

/** One relay peer's sealed-tunnel cipher + liveness bookkeeping. */
export type RelayPeer = {
    cipher: PairingTunnelCipher
    eventStreamAbort: AbortController | null
    pendingHeartbeat: { id: string; sentAt: number } | null
    peerPublicKey: string | null
}

export async function createRelayPeer(): Promise<RelayPeer> {
    return {
        cipher: await createPairingTunnelCipher(),
        eventStreamAbort: null,
        pendingHeartbeat: null,
        peerPublicKey: null,
    }
}

/** Rebuild the datachannel upload magic frame from a sealed relay binary frame. */
export function buildPairingRelayUploadFrame(frame: PairingTunnelBinaryFrame): ArrayBuffer {
    const bytes = fromPairingTunnelBase64Url(frame.bytesBase64)
    return createPairingUploadChunkFrame({
        chunk: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        chunkIndex: frame.chunkIndex,
        final: frame.chunkIndex === frame.chunkCount - 1,
        transferId: frame.transferId,
    })
}

export function defaultScheduleTimeout(callback: () => void, delayMs: number): () => void {
    const timer = setTimeout(callback, delayMs)
    unrefTimer(timer)
    return () => clearTimeout(timer)
}

export function defaultScheduleInterval(callback: () => void, intervalMs: number): () => void {
    const timer = setInterval(callback, intervalMs)
    unrefTimer(timer)
    return () => clearInterval(timer)
}

export function parseJson(data: string): unknown {
    try {
        return JSON.parse(data) as unknown
    } catch {
        return null
    }
}

function unrefTimer(timer: unknown): void {
    if (typeof timer === 'object' && timer !== null && 'unref' in timer && typeof timer.unref === 'function') {
        timer.unref()
    }
}
