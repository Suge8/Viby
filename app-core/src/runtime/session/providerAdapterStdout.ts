import type { Metadata } from '@/api/types'
import { parseProviderAdapterEventLine } from '@/runtime/providerAdapterProtocol'
import type { ProviderAdapterBridge } from './providerAdapterBridge'

export type ProviderAdapterStdoutResult = { type: 'ok' } | { type: 'fatal'; message: string }

export async function handleProviderAdapterStdoutLine(options: {
    line: string
    bridge: ProviderAdapterBridge
    onSessionStarted: (sessionId: string, metadata: Metadata) => void
}): Promise<ProviderAdapterStdoutResult> {
    const parsed = parseProviderAdapterEventLine(options.line)
    if (!parsed.ok) {
        return {
            type: 'fatal',
            message: `Invalid provider adapter stdout: ${parsed.error}; line=${previewLine(options.line)}`,
        }
    }

    const event = parsed.value
    if (event.type === 'runtime.session-started') {
        options.bridge.registerSession(event.sessionId)
        options.onSessionStarted(event.sessionId, event.metadata)
        return { type: 'ok' }
    }

    await options.bridge.handleEvent(event)
    return { type: 'ok' }
}

function previewLine(line: string): string {
    const compact = line.trim().replace(/\s+/g, ' ')
    return JSON.stringify(compact.length > 240 ? `${compact.slice(0, 237)}...` : compact)
}
