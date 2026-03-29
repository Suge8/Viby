import { describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => ({
    vibyServer: {
        url: 'http://127.0.0.1:4319/',
        stop: vi.fn(),
        toolNames: ['change_title', 'team_get_snapshot', 'team_accept_task']
    },
    bridgeCommand: {
        command: 'node',
        args: ['bin/viby.cjs']
    }
}))

vi.mock('@/claude/utils/startVibyServer', () => ({
    startVibyServer: vi.fn(async () => harness.vibyServer)
}))

vi.mock('@/utils/spawnVibyCLI', () => ({
    getVibyCliCommand: vi.fn((args: string[]) => ({
        ...harness.bridgeCommand,
        args
    }))
}))

import { buildVibyMcpBridge } from './buildVibyMcpBridge'

describe('buildVibyMcpBridge', () => {
    it('forwards the session-scoped tool list into the stdio bridge command', async () => {
        const client = {} as never

        const result = await buildVibyMcpBridge(client)

        expect(result.server).toEqual({
            url: 'http://127.0.0.1:4319/',
            stop: harness.vibyServer.stop
        })
        expect(result.mcpServers.viby).toEqual({
            command: 'node',
            args: [
                'mcp',
                '--url',
                'http://127.0.0.1:4319/',
                '--tool',
                'change_title',
                '--tool',
                'team_get_snapshot',
                '--tool',
                'team_accept_task'
            ]
        })
    })
})
