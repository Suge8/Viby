import type { ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { DirectRuntimeRegistry } from '../../../../hub/src/runtime/directRuntimeRegistry'
import { spawnChildProcess } from './spawnProcess'

const { spawnInternalRuntimeMock, stopTrackedSessionProcessMock } = vi.hoisted(() => ({
    spawnInternalRuntimeMock: vi.fn(),
    stopTrackedSessionProcessMock: vi.fn(async () => true),
}))

vi.mock('@/utils/spawnInternalRuntime', () => ({
    spawnInternalRuntime: spawnInternalRuntimeMock,
}))

vi.mock('./managedSessionLifecycle', () => ({
    stopTrackedSessionProcess: stopTrackedSessionProcessMock,
}))

type FakeChildProcess = ChildProcess & {
    stdout: EventEmitter
    stderr: EventEmitter
    stdin: { writable: boolean; write: ReturnType<typeof vi.fn> }
}

function createFakeChildProcess(pid: number): FakeChildProcess {
    const child = new EventEmitter() as FakeChildProcess
    Object.assign(child, {
        pid,
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        stdin: { writable: true, write: vi.fn(() => true) },
    })
    return child
}

function spawnOptions(child: FakeChildProcess): Parameters<typeof spawnChildProcess>[0] {
    spawnInternalRuntimeMock.mockReturnValue(child)
    return {
        args: ['internal-session', 'claude'],
        cwd: '/repo',
        env: {},
        directory: '/repo',
        directoryCreated: false,
        cleanupDriverSwitchTransport: vi.fn(async () => undefined),
        maybeCleanupWorktree: vi.fn(async () => undefined),
        pidToTrackedSession: new Map(),
        pidToAwaiter: new Map(),
        pidToErrorAwaiter: new Map(),
        onChildExited: vi.fn(),
        onSessionStarted: vi.fn(),
        reportSpawnOutcome: vi.fn(),
        directRuntimeRegistry: new DirectRuntimeRegistry(),
        getRuntimeCore: () => null,
    }
}

describe('spawnChildProcess provider adapter stdout', () => {
    it('fails closed when provider stdout is not protocol NDJSON', async () => {
        stopTrackedSessionProcessMock.mockClear()
        const child = createFakeChildProcess(801)
        const options = spawnOptions(child)
        const resultPromise = spawnChildProcess(options)

        child.stdout.emit('data', 'debug log on stdout\n')
        const result = await resultPromise
        if (result.type !== 'error') throw new Error('spawn should fail')

        expect(result.errorMessage).toContain('Provider adapter protocol failed for PID 801')
        expect(result.errorMessage).toContain('Invalid provider adapter stdout: invalid-json')
        expect(stopTrackedSessionProcessMock).toHaveBeenCalledWith(
            expect.objectContaining({ pid: 801, spawnAbandoned: true })
        )
        expect(options.reportSpawnOutcome).toHaveBeenCalledWith({
            type: 'error',
            details: expect.objectContaining({ pid: 801, message: result.errorMessage }),
        })
    })
})
