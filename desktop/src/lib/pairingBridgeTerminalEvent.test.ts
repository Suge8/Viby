import { describe, expect, it } from 'bun:test'
import { serializePairingTerminalEvent } from './pairingBridgeCore'

describe('serializePairingTerminalEvent', () => {
    it('serializes terminal ready events through the shared peer envelope', () => {
        expect(
            JSON.parse(
                serializePairingTerminalEvent({
                    type: 'ready',
                    sessionId: 'session-1',
                    terminalId: 'terminal-1',
                })
            )
        ).toEqual({
            kind: 'event',
            event: 'terminal-event',
            payload: {
                type: 'ready',
                sessionId: 'session-1',
                terminalId: 'terminal-1',
            },
        })
    })

    it('serializes terminal output without escaping into a second transport', () => {
        expect(
            JSON.parse(
                serializePairingTerminalEvent({
                    type: 'output',
                    sessionId: 'session-1',
                    terminalId: 'terminal-1',
                    data: '\u001b[32mok\u001b[0m',
                })
            )
        ).toMatchObject({
            kind: 'event',
            event: 'terminal-event',
            payload: {
                type: 'output',
                data: '\u001b[32mok\u001b[0m',
            },
        })
    })

    it('serializes terminal exit state as data, not a transport close', () => {
        expect(
            JSON.parse(
                serializePairingTerminalEvent({
                    type: 'exit',
                    sessionId: 'session-1',
                    terminalId: 'terminal-1',
                    code: 0,
                    signal: null,
                })
            )
        ).toMatchObject({
            payload: {
                type: 'exit',
                code: 0,
                signal: null,
            },
        })
    })

    it('serializes terminal errors as terminal-scoped events', () => {
        expect(
            JSON.parse(
                serializePairingTerminalEvent({
                    type: 'error',
                    sessionId: 'session-1',
                    terminalId: 'terminal-1',
                    message: 'CLI disconnected.',
                })
            )
        ).toMatchObject({
            payload: {
                type: 'error',
                sessionId: 'session-1',
                terminalId: 'terminal-1',
                message: 'CLI disconnected.',
            },
        })
    })
})
