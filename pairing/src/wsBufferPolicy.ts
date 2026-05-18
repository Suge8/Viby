export function shouldBufferPairingTunnelMessage(rawText: string): boolean {
    try {
        const frame = JSON.parse(rawText) as { kind?: unknown }
        return frame.kind === 'key'
    } catch {
        return false
    }
}
