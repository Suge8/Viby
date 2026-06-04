import { describe, expect, it } from 'vitest'
import {
    PROVIDER_ADAPTER_EVENT_SESSION_STARTED,
    parseProviderAdapterEvent,
    parseProviderAdapterEventLine,
    parseProviderAdapterInputLine,
    serializeProviderAdapterEvent,
} from './providerAdapterProtocol'

describe('providerAdapterProtocol', () => {
    it('round-trips session-started runtime events as NDJSON', () => {
        const event = {
            type: PROVIDER_ADAPTER_EVENT_SESSION_STARTED,
            sessionId: 'session-1',
            metadata: { path: '/repo', host: 'desk', hostPid: 42, startedBy: 'app-core' },
        } as const

        const wire = serializeProviderAdapterEvent(event)

        expect(wire.endsWith('\n')).toBe(true)
        expect(parseProviderAdapterEvent(wire.trim())).toEqual(event)
    })

    it('rejects dirty provider stdout lines with parse reasons', () => {
        expect(parseProviderAdapterEventLine('not json')).toEqual({ ok: false, error: 'invalid-json' })
        expect(parseProviderAdapterEventLine(JSON.stringify({ type: 'log', message: 'x' })).ok).toBe(false)
        expect(
            parseProviderAdapterEventLine(
                JSON.stringify({ type: PROVIDER_ADAPTER_EVENT_SESSION_STARTED, sessionId: 's1', metadata: {} })
            ).ok
        ).toBe(false)
    })

    it('accepts only canonical runtime message content', () => {
        expect(
            parseProviderAdapterEventLine(
                JSON.stringify({
                    type: 'runtime.message',
                    sessionId: 's1',
                    message: { role: 'agent', content: { type: 'output', data: { text: 'ok' } } },
                })
            ).ok
        ).toBe(true)
        expect(
            parseProviderAdapterEventLine(
                JSON.stringify({ type: 'runtime.message', sessionId: 's1', message: 'raw text' })
            ).ok
        ).toBe(false)
    })

    it('requires structured runtime alive and terminal payloads', () => {
        expect(
            parseProviderAdapterEventLine(
                JSON.stringify({ type: 'runtime.session-alive', payload: { sid: 's1', time: Date.now() } })
            ).ok
        ).toBe(false)
        expect(
            parseProviderAdapterEventLine(
                JSON.stringify({
                    type: 'runtime.terminal-event',
                    event: { type: 'output', sessionId: 's1', terminalId: 't1' },
                })
            ).ok
        ).toBe(false)
    })

    it('requires versioned metadata ack result semantics', () => {
        expect(
            parseProviderAdapterInputLine(
                JSON.stringify({
                    type: 'runtime.metadata-result',
                    requestId: 'r1',
                    result: 'version-mismatch',
                    version: 2,
                    value: { path: '/repo', host: 'desk' },
                })
            ).ok
        ).toBe(true)
        expect(
            parseProviderAdapterInputLine(
                JSON.stringify({ type: 'runtime.metadata-result', requestId: 'r1', ok: true })
            ).ok
        ).toBe(false)
    })
})
