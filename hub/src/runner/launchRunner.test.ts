import { describe, expect, it } from 'bun:test'
import type { ChildProcess } from 'node:child_process'
import { waitForRunnerOnline } from './launchRunner'
import type { Machine, SyncEngine } from '../sync/syncEngine'

type MutableChildProcess = ChildProcess & {
    exitCode: number | null
    signalCode: NodeJS.Signals | null
}

function createChildProcess(pid: number): MutableChildProcess {
    return {
        pid,
        exitCode: null,
        signalCode: null
    } as MutableChildProcess
}

function createMachine(options: {
    active?: boolean
    vibyHomeDir?: string
    pid?: number
    status?: string
} = {}): Machine {
    return {
        id: 'machine-1',
        seq: 1,
        createdAt: 0,
        updatedAt: 0,
        active: options.active ?? true,
        activeAt: 0,
        metadata: {
            host: 'host',
            platform: 'darwin',
            vibyCliVersion: '1.0.0',
            vibyHomeDir: options.vibyHomeDir
        },
        metadataVersion: 1,
        runnerState: {
            pid: options.pid,
            status: options.status ?? 'running'
        },
        runnerStateVersion: 1
    }
}

function createSyncEngine(getOnlineMachines: () => Machine[]): SyncEngine {
    return {
        getOnlineMachines
    } as SyncEngine
}

describe('waitForRunnerOnline', () => {
    it('accepts an already-running matching runner when the new child exits cleanly', async () => {
        const child = createChildProcess(123)
        let pollCount = 0
        const syncEngine = createSyncEngine(() => {
            pollCount += 1
            if (pollCount === 1) {
                return []
            }

            child.exitCode = 0
            return [createMachine({
                vibyHomeDir: '/tmp/viby',
                pid: 999,
                status: 'running'
            })]
        })

        await expect(waitForRunnerOnline({
            child,
            dataDir: '/tmp/viby',
            syncEngine,
            timeoutMs: 1_000,
            sleepMs: async () => {}
        })).resolves.toEqual({
            machineId: 'machine-1',
            ownership: 'reused'
        })
    })

    it('waits for the reusable runner to reconnect after the probe exits cleanly', async () => {
        const child = createChildProcess(123)
        let pollCount = 0
        const syncEngine = createSyncEngine(() => {
            pollCount += 1
            if (pollCount === 2) {
                child.exitCode = 0
            }
            if (pollCount < 4) {
                return []
            }

            return [createMachine({
                vibyHomeDir: '/tmp/viby',
                pid: 999,
                status: 'running'
            })]
        })

        await expect(waitForRunnerOnline({
            child,
            dataDir: '/tmp/viby',
            syncEngine,
            timeoutMs: 1_000,
            sleepMs: async () => {}
        })).resolves.toEqual({
            machineId: 'machine-1',
            ownership: 'reused'
        })
    })

    it('returns child ownership when the spawned runner itself comes online', async () => {
        const child = createChildProcess(123)
        const syncEngine = createSyncEngine(() => [createMachine({
            vibyHomeDir: '/tmp/viby',
            pid: 123,
            status: 'running'
        })])

        await expect(waitForRunnerOnline({
            child,
            dataDir: '/tmp/viby',
            syncEngine,
            timeoutMs: 1_000,
            sleepMs: async () => {}
        })).resolves.toEqual({
            machineId: 'machine-1',
            ownership: 'child'
        })
    })

    it('still fails when the child exits and no managed runner comes online', async () => {
        const child = createChildProcess(123)
        let pollCount = 0
        const syncEngine = createSyncEngine(() => {
            pollCount += 1
            if (pollCount > 1) {
                child.exitCode = 0
            }
            return []
        })

        await expect(waitForRunnerOnline({
            child,
            dataDir: '/tmp/viby',
            syncEngine,
            timeoutMs: 1_000,
            sleepMs: async () => {}
        })).rejects.toThrow('这台机器没有在预期时间内连回中枢。')
    })
})
