import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test'
import type { ChildProcess } from 'node:child_process'

import { createManagedRunnerController } from './managedRunner'
import { recoverManagedRunner as recoverManagedRunnerImpl } from '../runner/supervisor'
import type { Machine, SyncEngine } from '../sync/syncEngine'

type FakeSyncEngine = Pick<SyncEngine, 'getMachine' | 'subscribe'>
type ManagedRunnerControllerOptions = Parameters<typeof createManagedRunnerController>[0]

const writeRuntimeStatus = vi.fn(async () => {})
const startRunnerProcess = vi.fn(() => ({ pid: 123, on: vi.fn() } as unknown as ChildProcess))
const stopRunnerProcess = vi.fn(async () => {})
const stopRunnerPid = vi.fn(async () => {})
const waitForRunnerOnline = vi.fn(async () => ({
    machineId: 'machine-1',
    ownership: 'reused' as const
}))
const recoverManagedRunner = vi.fn(async (options: Parameters<typeof recoverManagedRunnerImpl>[0]) => {
    await options.startRunner()
    await options.onRecovered('startup')
})

function createMachine(pid: number): Machine {
    return {
        id: 'machine-1',
        seq: 1,
        createdAt: 0,
        updatedAt: 0,
        active: true,
        activeAt: 0,
        metadata: {
            host: 'host',
            platform: 'darwin',
            vibyCliVersion: '1.0.0',
            vibyHomeDir: '/tmp/viby'
        },
        metadataVersion: 1,
        runnerState: {
            pid,
            status: 'running'
        },
        runnerStateVersion: 1
    }
}

function createSyncEngine(subscribeSpy: ReturnType<typeof vi.fn>): FakeSyncEngine {
    return {
        getMachine: () => createMachine(321),
        subscribe: subscribeSpy
    }
}

function createController(
    overrides: Partial<ManagedRunnerControllerOptions> = {}
): ReturnType<typeof createManagedRunnerController> {
    return createManagedRunnerController({
        dataDir: '/tmp/viby',
        localHubUrl: 'http://127.0.0.1:37173',
        getSyncEngine: () => createSyncEngine(vi.fn(() => vi.fn())) as SyncEngine,
        isShuttingDown: () => false,
        writeRuntimeStatus,
        buildReadyStatusMessage: () => 'ready',
        buildStartingStatusMessage: (message) => message,
        startRunnerProcess,
        stopRunnerProcess,
        stopRunnerPid,
        waitForRunnerOnline,
        recoverManagedRunner,
        ...overrides
    })
}

describe('createManagedRunnerController', () => {
    beforeEach(() => {
        writeRuntimeStatus.mockClear()
        startRunnerProcess.mockClear()
        stopRunnerProcess.mockClear()
        stopRunnerPid.mockClear()
        waitForRunnerOnline.mockClear()
        recoverManagedRunner.mockClear()
        vi.useRealTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('rebinds reused runner watch after runtime reload', async () => {
        const unsubscribeA = vi.fn()
        const unsubscribeB = vi.fn()
        const subscribeA = vi.fn(() => unsubscribeA)
        const subscribeB = vi.fn(() => unsubscribeB)
        let currentSyncEngine: FakeSyncEngine = createSyncEngine(subscribeA)

        const controller = createController({
            getSyncEngine: () => currentSyncEngine as SyncEngine,
            recoverManagedRunner
        })

        await controller.startStartupRecovery()
        expect(subscribeA).toHaveBeenCalledTimes(1)

        currentSyncEngine = createSyncEngine(subscribeB)
        controller.onRuntimeReload()

        expect(unsubscribeA).toHaveBeenCalledTimes(1)
        expect(subscribeB).toHaveBeenCalledTimes(1)
    })

    it('stops reused runner by pid when no child handle exists', async () => {
        const controller = createController()

        await controller.startStartupRecovery()
        await controller.stop()

        expect(stopRunnerProcess).not.toHaveBeenCalled()
        expect(stopRunnerPid).toHaveBeenCalledWith(321)
    })

    it('restarts a reused runner when pid polling finds the process is gone', async () => {
        vi.useFakeTimers()

        let machine: Machine | null = createMachine(321)
        let processAlive = true
        const subscribe = vi.fn(() => vi.fn())
        const recoverManagedRunner = vi.fn(async (options: Parameters<typeof recoverManagedRunnerImpl>[0]) => {
            if (options.mode === 'startup') {
                await options.startRunner()
                await options.onRecovered('startup')
            }
        })

        const controller = createController({
            getSyncEngine: () => ({
                getMachine: () => machine,
                subscribe
            } as unknown as SyncEngine),
            isLocalProcessAlive: () => processAlive,
            recoverManagedRunner
        })

        await controller.startStartupRecovery()
        expect(recoverManagedRunner).toHaveBeenCalledTimes(1)

        processAlive = false
        vi.advanceTimersByTime(1_000)
        await Promise.resolve()

        expect(recoverManagedRunner).toHaveBeenCalledTimes(2)
        machine = null
    })
})
