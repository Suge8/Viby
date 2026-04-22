import { describe, expect, it } from 'bun:test'
import { RpcRegistry } from '../socket/rpcRegistry'
import { RpcGateway } from './rpcGateway'

function createGateway(response: unknown, method: string): RpcGateway {
    const rpcRegistry = new RpcRegistry()
    const socket = {
        id: 'socket-1',
        timeout: () => ({
            emitWithAck: async () => JSON.stringify(response),
        }),
    }
    rpcRegistry.register(socket as never, method)

    return new RpcGateway(
        {
            of: () => ({
                sockets: new Map([[socket.id, socket]]),
            }),
        } as never,
        rpcRegistry
    )
}

describe('RpcGateway browseMachineDirectory', () => {
    it('downgrades missing browse-directory handlers into a non-500 unsupported response', async () => {
        const gateway = new RpcGateway({ of: () => ({ sockets: new Map() }) } as never, new RpcRegistry())

        await expect(gateway.browseMachineDirectory('machine-1')).resolves.toEqual({
            success: false,
            entries: [],
            roots: [],
            error: 'Machine directory browsing is unavailable until the target Viby process reconnects with the latest capabilities.',
        })
    })

    it('normalizes path-exists payloads to explicit booleans', async () => {
        const gateway = createGateway(
            {
                exists: {
                    '/tmp/alpha': true,
                    '/tmp/beta': false,
                    '/tmp/gamma': 'truthy',
                },
            },
            'machine-1:path-exists'
        )

        await expect(gateway.checkPathsExist('machine-1', ['/tmp/alpha', '/tmp/beta', '/tmp/gamma'])).resolves.toEqual({
            '/tmp/alpha': true,
            '/tmp/beta': false,
            '/tmp/gamma': false,
        })
    })

    it('surfaces spawn errors from machine RPC payloads', async () => {
        const gateway = createGateway(
            {
                type: 'error',
                errorMessage: 'spawn denied',
            },
            'machine-1:spawn-viby-session'
        )

        await expect(
            gateway.spawnSession({
                machineId: 'machine-1',
                directory: '/workspace',
                agent: 'claude',
            })
        ).resolves.toEqual({
            type: 'error',
            message: 'spawn denied',
        })
    })
})
