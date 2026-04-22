import { describe, expect, it, vi } from 'vitest'

vi.mock('@/configuration', () => ({
    configuration: {
        apiUrl: 'http://127.0.0.1:4123',
        cliApiToken: 'runner-cli-token',
    },
}))

import { buildSpawnEnvironment } from './runnerSpawnEnvironment'

describe('buildSpawnEnvironment', () => {
    it('injects resolved hub identity into runner-managed child sessions', async () => {
        const env = await buildSpawnEnvironment(
            {
                machineId: 'machine-1',
                directory: '/tmp/project',
                agent: 'codex',
            },
            null
        )

        expect(env).toMatchObject({
            VIBY_API_URL: 'http://127.0.0.1:4123',
            CLI_API_TOKEN: 'runner-cli-token',
            VIBY_MACHINE_ID: 'machine-1',
        })
    })

    it('preserves injected runner identity when provider auth env is added', async () => {
        const env = await buildSpawnEnvironment(
            {
                machineId: 'machine-1',
                directory: '/tmp/project',
                agent: 'claude',
                token: 'provider-token',
            },
            null
        )

        expect(env).toMatchObject({
            VIBY_API_URL: 'http://127.0.0.1:4123',
            CLI_API_TOKEN: 'runner-cli-token',
            VIBY_MACHINE_ID: 'machine-1',
            CLAUDE_CODE_OAUTH_TOKEN: 'provider-token',
        })
    })
})
