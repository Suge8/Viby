import type { ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { DirectRuntimeRegistry } from '../../../../hub/src/runtime/directRuntimeRegistry'
import { ProviderAdapterBridge } from './providerAdapterBridge'

type FakeChildProcess = ChildProcess & {
    stdin: { writable: boolean; write: ReturnType<typeof vi.fn> }
}

function createBridge(): { bridge: ProviderAdapterBridge; registry: DirectRuntimeRegistry } {
    const child = new EventEmitter() as FakeChildProcess
    Object.assign(child, {
        pid: 901,
        stdin: { writable: true, write: vi.fn(() => true) },
    })
    const registry = new DirectRuntimeRegistry()
    const bridge = new ProviderAdapterBridge(child, registry, () => null)
    bridge.registerSession('session-1')
    return { bridge, registry }
}

describe('ProviderAdapterBridge', () => {
    it('times out pending direct RPC calls', async () => {
        vi.useFakeTimers()
        const { registry } = createBridge()
        const target = registry.getSessionTarget('session-1')
        if (!target) throw new Error('target missing')

        const response = target.callRpc('session-1:status', { ok: true }, 10)
        vi.advanceTimersByTime(10)

        await expect(response).rejects.toThrow('Runtime RPC timed out: session-1:status')
        vi.useRealTimers()
    })

    it('rejects pending direct RPC calls when the child exits before ack', async () => {
        const { bridge, registry } = createBridge()
        const target = registry.getSessionTarget('session-1')
        if (!target) throw new Error('target missing')

        const response = target.callRpc('session-1:status', { ok: true }, 1_000)
        bridge.dispose()

        await expect(response).rejects.toThrow('Runtime process disconnected before RPC response')
    })
})
