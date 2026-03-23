import { describe, expect, it } from 'bun:test'
import { RpcRegistry } from '../socket/rpcRegistry'
import { RpcGateway } from './rpcGateway'

describe('RpcGateway browseMachineDirectory', () => {
    it('downgrades missing browse-directory handlers into a non-500 unsupported response', async () => {
        const gateway = new RpcGateway(
            { of: () => ({ sockets: new Map() }) } as never,
            new RpcRegistry()
        )

        await expect(gateway.browseMachineDirectory('machine-1')).resolves.toEqual({
            success: false,
            entries: [],
            roots: [],
            error: 'Machine directory browsing is unavailable until the target Viby process reconnects with the latest capabilities.'
        })
    })
})
