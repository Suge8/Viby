import { PROTOCOL_VERSION } from '@viby/protocol'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { assertHubProtocolCompatibility, HubProtocolCompatibilityError } from './runtimeCompatibility'

function mockHealth(payload: unknown): void {
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'json' } }))
    )
}

describe('runtimeCompatibility', () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('accepts the current protocol', async () => {
        mockHealth({ protocolVersion: PROTOCOL_VERSION })

        await expect(assertHubProtocolCompatibility('/')).resolves.toBeUndefined()
    })

    it('blocks newer unsupported hubs', async () => {
        mockHealth({ protocolVersion: 99 })

        await expect(assertHubProtocolCompatibility('/')).rejects.toBeInstanceOf(HubProtocolCompatibilityError)
    })

    it('fails open when health is temporarily unreachable', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response('', { status: 503 }))
        )

        await expect(assertHubProtocolCompatibility('/')).resolves.toBeUndefined()
    })
})
