import { describe, expect, it } from 'bun:test'
import { DirectRuntimeRegistry, type DirectRuntimeTarget } from '../runtime/directRuntimeRegistry'
import { RpcGateway } from './rpcGateway'

class FakeDirectTarget implements DirectRuntimeTarget {
    readonly id = 'target-1'
    constructor(private readonly response: unknown) {}
    async callRpc(): Promise<unknown> {
        return JSON.stringify(this.response)
    }
    send(): boolean {
        return false
    }
}

function createGateway(response: unknown, method: string): RpcGateway {
    const directRuntimeRegistry = new DirectRuntimeRegistry()
    directRuntimeRegistry.registerRpc(method, new FakeDirectTarget(response))
    return new RpcGateway(directRuntimeRegistry)
}

function version() {
    return {
        status: 'supported' as const,
        supportedVersion: '0.130.0',
        source: 'test',
        installedVersion: '0.130.0',
        checkedAt: 1,
    }
}

describe('RpcGateway browseMachineDirectory', () => {
    it('downgrades missing browse-directory handlers into a non-500 unsupported response', async () => {
        const gateway = new RpcGateway(new DirectRuntimeRegistry())

        await expect(gateway.browseMachineDirectory('machine-1')).resolves.toEqual({
            success: false,
            entries: [],
            roots: [],
            error: 'Machine directory browsing is unavailable until the target Viby process reconnects with the latest capabilities.',
        })
    })

    it('normalizes path-exists payloads to explicit booleans', async () => {
        const gateway = createGateway(
            { exists: { '/tmp/alpha': true, '/tmp/beta': false, '/tmp/gamma': 'truthy' } },
            'machine-1:path-exists'
        )

        await expect(gateway.checkPathsExist('machine-1', ['/tmp/alpha', '/tmp/beta', '/tmp/gamma'])).resolves.toEqual({
            '/tmp/alpha': true,
            '/tmp/beta': false,
            '/tmp/gamma': false,
        })
    })

    it('rejects malformed agent launch config payloads through the shared schema', async () => {
        const gateway = createGateway(
            {
                type: 'success',
                config: { agent: 'codex', availableModels: [{ id: 'gpt', label: 42, supportedThinkingLevels: [] }] },
            },
            'machine-1:resolve-agent-launch-config'
        )

        await expect(
            gateway.resolveAgentLaunchConfig('machine-1', { agent: 'codex', directory: '/workspace' })
        ).rejects.toThrow('Unexpected resolve-agent-launch-config result')
    })

    it('surfaces spawn errors from machine RPC payloads', async () => {
        const gateway = createGateway({ type: 'error', errorMessage: 'spawn denied' }, 'machine-1:spawn-viby-session')

        await expect(
            gateway.spawnSession({ machineId: 'machine-1', directory: '/workspace', agent: 'claude' })
        ).resolves.toEqual({ type: 'error', message: 'spawn denied' })
    })

    it('validates agent config RPC payloads through shared schemas', async () => {
        const gateway = createGateway(
            {
                agents: [
                    {
                        driver: 'codex',
                        path: '/home/user/.codex/config.toml',
                        exists: true,
                        values: { 'codex.model': 'gpt-5.4' },
                        version: version(),
                    },
                ],
            },
            'machine-1:load-agent-config-files'
        )

        await expect(gateway.loadAgentConfigFiles('machine-1')).resolves.toEqual({
            agents: [
                {
                    driver: 'codex',
                    path: '/home/user/.codex/config.toml',
                    exists: true,
                    values: { 'codex.model': 'gpt-5.4' },
                    version: version(),
                },
            ],
        })
    })

    it('validates restored agent config payloads through shared schemas', async () => {
        const gateway = createGateway(
            {
                driver: 'codex',
                path: '/home/user/.codex/config.toml',
                exists: true,
                values: { 'codex.model': 'gpt-5.2' },
                version: version(),
            },
            'machine-1:restore-agent-config-file'
        )

        await expect(
            gateway.restoreAgentConfigFile('machine-1', {
                driver: 'codex',
                backupPath: '/home/user/.codex/.viby-backups/config.toml.bak',
            })
        ).resolves.toEqual({
            driver: 'codex',
            path: '/home/user/.codex/config.toml',
            exists: true,
            values: { 'codex.model': 'gpt-5.2' },
            version: version(),
        })
    })
})
