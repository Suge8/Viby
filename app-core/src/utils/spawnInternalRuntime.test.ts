import type { SpawnOptions } from 'child_process'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const spawnMock = vi.fn((..._args: unknown[]) => ({ pid: 12345 }) as never)

vi.mock('child_process', async () => {
    const actual = await vi.importActual<typeof import('child_process')>('child_process')
    return {
        ...actual,
        spawn: spawnMock,
    }
})

const originalInvokedCwd = process.env.VIBY_INVOKED_CWD

function getSpawnOptionsOrThrow(): SpawnOptions {
    expect(spawnMock).toHaveBeenCalledTimes(1)
    const firstCall = spawnMock.mock.calls[0] as unknown[] | undefined
    const options = firstCall?.[2] as SpawnOptions | undefined
    if (!options) {
        throw new Error('Expected spawn options to be passed as third argument')
    }
    return options
}

describe('spawnInternalRuntime', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        if (originalInvokedCwd === undefined) {
            delete process.env.VIBY_INVOKED_CWD
        } else {
            process.env.VIBY_INVOKED_CWD = originalInvokedCwd
        }
    })

    it('sets windowsHide only for detached Windows processes', async () => {
        const { withWindowsSpawnOptions } = await import('./spawnInternalRuntime')

        expect(withWindowsSpawnOptions({ detached: true }, 'win32')).toMatchObject({
            detached: true,
            windowsHide: true,
        })
        expect(withWindowsSpawnOptions({ detached: false }, 'win32')).toEqual({ detached: false })
        expect(withWindowsSpawnOptions({ detached: true }, 'linux')).toEqual({ detached: true })
    })

    it('spawns with explicit env and current platform options', async () => {
        const { spawnInternalRuntime } = await import('./spawnInternalRuntime')

        spawnInternalRuntime(['__internal_agent_availability'], {
            detached: false,
            stdio: 'ignore',
        })

        const options = getSpawnOptionsOrThrow()
        expect(options.detached).toBe(false)
        expect(options.env?.VIBY_APP_CORE_INTERNAL).toBe('1')
    })

    it('forces Bun child processes to run with the AppCore project root as cwd', async () => {
        const { getInternalRuntimeCommand } = await import('./spawnInternalRuntime')

        const command = getInternalRuntimeCommand(['mcp', '--url', 'http://127.0.0.1:1234/'])
        const isBunRuntime = Boolean((process.versions as Record<string, string | undefined>).bun)

        expect(command.command).toBe(process.execPath)
        if (isBunRuntime) {
            expect(command.args[0]).toBe('--cwd')
            expect(command.args[1].replace(/\\/g, '/')).toMatch(/\/app-core$/)
            expect(command.args[2].replace(/\\/g, '/')).toMatch(/\/app-core\/src\/internalRuntimeBootstrap\.ts$/)
        } else {
            expect(
                command.args.some((arg) =>
                    arg.replace(/\\/g, '/').endsWith('/app-core/src/internalRuntimeBootstrap.ts')
                )
            ).toBe(true)
        }
    })

    it('passes invoked workspace cwd to child processes when cwd is provided', async () => {
        const { spawnInternalRuntime } = await import('./spawnInternalRuntime')
        const childCwd = 'C:\\workspace\\project'

        spawnInternalRuntime(['__internal_agent_availability'], {
            cwd: childCwd,
            stdio: 'ignore',
        })

        const options = getSpawnOptionsOrThrow()
        expect(options.env?.VIBY_INVOKED_CWD).toBe(childCwd)
    })

    it('prefers the explicit child cwd over an inherited VIBY_INVOKED_CWD', async () => {
        process.env.VIBY_INVOKED_CWD = '/previous/workspace'
        const { spawnInternalRuntime } = await import('./spawnInternalRuntime')

        spawnInternalRuntime(['__internal_agent_availability'], {
            cwd: '/next/workspace',
            stdio: 'ignore',
        })

        const options = getSpawnOptionsOrThrow()
        expect(options.env?.VIBY_INVOKED_CWD).toBe('/next/workspace')
    })

    it('keeps an existing absolute VIBY_INVOKED_CWD when no child cwd is provided', async () => {
        process.env.VIBY_INVOKED_CWD = '/workspace/from/env'
        const { spawnInternalRuntime } = await import('./spawnInternalRuntime')

        spawnInternalRuntime(['__internal_agent_availability'], { stdio: 'ignore' })

        const options = getSpawnOptionsOrThrow()
        expect(options.env?.VIBY_INVOKED_CWD).toBe('/workspace/from/env')
    })
})
