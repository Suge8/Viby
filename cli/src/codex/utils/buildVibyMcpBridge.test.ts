import { describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => ({
    vibyServer: {
        url: 'http://127.0.0.1:4319/',
        stop: vi.fn(),
        toolNames: ['get_snapshot', 'accept_task'],
    },
    bridgeCommand: {
        command: 'node',
        args: ['bin/viby.cjs'],
    },
}))

vi.mock('@/claude/utils/startVibyServer', () => ({
    startVibyServer: vi.fn(async () => harness.vibyServer),
}))

vi.mock('@/utils/spawnVibyCLI', () => ({
    getVibyCliCommand: vi.fn((args: string[]) => ({
        ...harness.bridgeCommand,
        args,
    })),
}))

import { buildVibyMcpBridge } from './buildVibyMcpBridge'

describe('buildVibyMcpBridge', () => {
    it('forwards the session-scoped tool list into the stdio bridge command', async () => {
        const client = {} as never

        const result = await buildVibyMcpBridge(client)

        expect(result.server).toEqual({
            url: 'http://127.0.0.1:4319/',
            stop: harness.vibyServer.stop,
        })
        expect(result.mcpServers.viby).toEqual({
            command: 'node',
            args: ['mcp', '--url', 'http://127.0.0.1:4319/', '--tool', 'get_snapshot', '--tool', 'accept_task'],
        })
    })

    it('returns an empty bridge when the session has no enabled VIBY tools', async () => {
        const startVibyServer = await import('@/claude/utils/startVibyServer')
        vi.mocked(startVibyServer.startVibyServer).mockResolvedValueOnce(null)

        const result = await buildVibyMcpBridge({} as never)

        expect(result).toEqual({
            server: null,
            mcpServers: {},
        })
    })
})
