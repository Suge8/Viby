import { describe, expect, it } from 'bun:test'
import type { ProviderAdapterInput } from '@viby/protocol/providerAdapterProtocol'
import { DirectRuntimeRegistry, type DirectRuntimeTarget } from '../../runtime/directRuntimeRegistry'
import type { SocketWithData } from '../socketTypes'
import { TerminalRegistry } from '../terminalRegistry'
import { registerTerminalHandlers } from './terminal'

type EmittedEvent = { event: string; data: unknown }
type TerminalInput = Extract<ProviderAdapterInput, { type: 'runtime.terminal-input' }>

class FakeSocket {
    readonly data: Record<string, unknown> = {}
    readonly emitted: EmittedEvent[] = []
    private readonly handlers = new Map<string, (...args: unknown[]) => void>()
    constructor(readonly id: string) {}
    on(event: string, handler: (...args: unknown[]) => void): this {
        this.handlers.set(event, handler)
        return this
    }
    emit(event: string, data: unknown): boolean {
        this.emitted.push({ event, data })
        return true
    }
    trigger(event: string, data?: unknown): void {
        const handler = this.handlers.get(event)
        if (!handler) return
        typeof data === 'undefined' ? handler() : handler(data)
    }
}

class FakeRuntimeTarget implements DirectRuntimeTarget {
    readonly id = 'runtime-target-1'
    readonly sent: ProviderAdapterInput[] = []
    async callRpc(): Promise<unknown> {
        return null
    }
    send(input: ProviderAdapterInput): boolean {
        this.sent.push(input)
        return true
    }
}

type Harness = {
    terminalSocket: FakeSocket
    terminalRegistry: TerminalRegistry
    runtimeTarget: FakeRuntimeTarget
    directRuntimeRegistry: DirectRuntimeRegistry
}

function createHarness(options?: {
    sessionActive?: boolean
    registerRuntime?: boolean
    maxTerminalsPerSocket?: number
    maxTerminalsPerSession?: number
}): Harness {
    const terminalSocket = new FakeSocket('terminal-socket')
    const terminalRegistry = new TerminalRegistry({ idleTimeoutMs: 0 })
    const directRuntimeRegistry = new DirectRuntimeRegistry()
    const runtimeTarget = new FakeRuntimeTarget()
    if (options?.registerRuntime !== false) directRuntimeRegistry.registerSession('session-1', runtimeTarget)
    registerTerminalHandlers(terminalSocket as unknown as SocketWithData, {
        getSession: () => ({ active: options?.sessionActive ?? true }),
        terminalRegistry,
        directRuntimeRegistry,
        maxTerminalsPerSocket: options?.maxTerminalsPerSocket ?? 4,
        maxTerminalsPerSession: options?.maxTerminalsPerSession ?? 4,
    })
    return { terminalSocket, terminalRegistry, runtimeTarget, directRuntimeRegistry }
}

function lastEmit(socket: FakeSocket, event: string): EmittedEvent | undefined {
    return [...socket.emitted].reverse().find((entry) => entry.event === event)
}

function lastTerminalInput(target: FakeRuntimeTarget): TerminalInput | undefined {
    return target.sent.filter((input): input is TerminalInput => input.type === 'runtime.terminal-input').at(-1)
}

describe('terminal socket handlers', () => {
    it('rejects terminal creation when session is inactive', () => {
        const { terminalSocket, terminalRegistry } = createHarness({ sessionActive: false })
        terminalSocket.trigger('terminal:create', {
            sessionId: 'session-1',
            terminalId: 'terminal-1',
            cols: 80,
            rows: 24,
        })
        expect(lastEmit(terminalSocket, 'terminal:error')?.data).toEqual({
            terminalId: 'terminal-1',
            message: 'Session is inactive or unavailable.',
        })
        expect(terminalRegistry.get('terminal-1')).toBeNull()
    })

    it('opens a terminal and forwards write/resize/close to the direct runtime target', () => {
        const { terminalSocket, runtimeTarget, terminalRegistry } = createHarness()
        terminalSocket.trigger('terminal:create', {
            sessionId: 'session-1',
            terminalId: 'terminal-1',
            cols: 120,
            rows: 40,
        })
        expect(lastTerminalInput(runtimeTarget)?.event).toEqual({
            type: 'open',
            sessionId: 'session-1',
            terminalId: 'terminal-1',
            cols: 120,
            rows: 40,
        })
        expect(terminalRegistry.get('terminal-1')).not.toBeNull()

        terminalSocket.trigger('terminal:write', { terminalId: 'terminal-1', data: 'ls\n' })
        expect(lastTerminalInput(runtimeTarget)?.event).toEqual({
            type: 'write',
            sessionId: 'session-1',
            terminalId: 'terminal-1',
            data: 'ls\n',
        })

        terminalSocket.trigger('terminal:resize', { terminalId: 'terminal-1', cols: 100, rows: 30 })
        expect(lastTerminalInput(runtimeTarget)?.event).toEqual({
            type: 'resize',
            sessionId: 'session-1',
            terminalId: 'terminal-1',
            cols: 100,
            rows: 30,
        })

        terminalSocket.trigger('terminal:close', { terminalId: 'terminal-1' })
        expect(lastTerminalInput(runtimeTarget)?.event).toEqual({
            type: 'close',
            sessionId: 'session-1',
            terminalId: 'terminal-1',
        })
        expect(terminalRegistry.get('terminal-1')).toBeNull()
    })

    it('cleans up and notifies runtime on terminal socket disconnect', () => {
        const { terminalSocket, runtimeTarget, terminalRegistry } = createHarness()
        terminalSocket.trigger('terminal:create', {
            sessionId: 'session-1',
            terminalId: 'terminal-1',
            cols: 90,
            rows: 24,
        })
        terminalSocket.trigger('disconnect')
        expect(lastTerminalInput(runtimeTarget)?.event).toEqual({
            type: 'close',
            sessionId: 'session-1',
            terminalId: 'terminal-1',
        })
        expect(terminalRegistry.get('terminal-1')).toBeNull()
    })

    it('enforces per-socket terminal limits', () => {
        const { terminalSocket } = createHarness({ maxTerminalsPerSocket: 1 })
        terminalSocket.trigger('terminal:create', {
            sessionId: 'session-1',
            terminalId: 'terminal-1',
            cols: 80,
            rows: 24,
        })
        terminalSocket.trigger('terminal:create', {
            sessionId: 'session-1',
            terminalId: 'terminal-2',
            cols: 80,
            rows: 24,
        })
        expect(lastEmit(terminalSocket, 'terminal:error')?.data).toEqual({
            terminalId: 'terminal-2',
            message: 'Too many terminals open (max 1).',
        })
    })

    it('allows the same session to reconnect an existing terminal id from a new socket', () => {
        const { terminalRegistry, directRuntimeRegistry } = createHarness({
            maxTerminalsPerSocket: 1,
            maxTerminalsPerSession: 1,
        })
        const firstSocket = new FakeSocket('terminal-socket-1')
        const secondSocket = new FakeSocket('terminal-socket-2')
        const deps = {
            getSession: () => ({ active: true }),
            terminalRegistry,
            directRuntimeRegistry,
            maxTerminalsPerSocket: 1,
            maxTerminalsPerSession: 1,
        }
        registerTerminalHandlers(firstSocket as unknown as SocketWithData, deps)
        registerTerminalHandlers(secondSocket as unknown as SocketWithData, deps)
        firstSocket.trigger('terminal:create', { sessionId: 'session-1', terminalId: 'terminal-1', cols: 80, rows: 24 })
        secondSocket.trigger('terminal:create', {
            sessionId: 'session-1',
            terminalId: 'terminal-1',
            cols: 120,
            rows: 40,
        })
        expect(lastEmit(secondSocket, 'terminal:error')).toBeUndefined()
        expect(terminalRegistry.get('terminal-1')?.socketId).toBe('terminal-socket-2')
    })
})
