import type { ChildProcess } from 'node:child_process'

import type { HubRuntimeStatusUpdate } from '../runtimeStatus'
import {
    getMachineRunnerPid,
    startRunnerProcess,
    stopRunnerPid,
    stopRunnerProcess,
    waitForRunnerOnline,
    type RunnerOnlineResult
} from '../runner/launchRunner'
import { shouldRestartReusedRunner } from '../runner/reusedRunnerHealth'
import { recoverManagedRunner, type RunnerRecoveryMode, type RunnerRetryContext } from '../runner/supervisor'
import type { Machine, SyncEngine } from '../sync/syncEngine'

const REUSED_RUNNER_WATCH_INTERVAL_MS = 1_000

type ManagedRunnerStatusWriter = (update: HubRuntimeStatusUpdate) => Promise<void>

type RunnerStarter = typeof startRunnerProcess
type RunnerStopper = typeof stopRunnerProcess
type RunnerPidStopper = typeof stopRunnerPid
type RunnerOnlineWaiter = typeof waitForRunnerOnline
type RunnerRecoveryWorker = typeof recoverManagedRunner

type ActiveRunnerBinding =
    | { kind: 'child'; child: ChildProcess }
    | { kind: 'reused'; machineId: string }
    | null

export type ManagedRunnerController = {
    startStartupRecovery(): Promise<void>
    onRuntimeReload(): void
    stop(): Promise<string | null>
}

type CreateManagedRunnerControllerOptions = {
    dataDir: string
    localHubUrl: string
    getSyncEngine: () => SyncEngine | null
    isShuttingDown: () => boolean
    writeRuntimeStatus: ManagedRunnerStatusWriter
    buildReadyStatusMessage: (overrides?: Array<string | null>) => string
    buildStartingStatusMessage: (message: string) => string
    isLocalProcessAlive?: (pid: number) => boolean
    startRunnerProcess?: RunnerStarter
    stopRunnerProcess?: RunnerStopper
    stopRunnerPid?: RunnerPidStopper
    waitForRunnerOnline?: RunnerOnlineWaiter
    recoverManagedRunner?: RunnerRecoveryWorker
}

function defaultIsLocalProcessAlive(pid: number): boolean {
    if (!Number.isFinite(pid) || pid <= 0) {
        return false
    }

    try {
        process.kill(pid, 0)
        return true
    } catch {
        return false
    }
}

function readReusedRunnerMachine(
    getSyncEngine: () => SyncEngine | null,
    machineId: string | null
): Machine | null {
    if (!machineId) {
        return null
    }

    const syncEngine = getSyncEngine()
    if (!syncEngine) {
        return null
    }

    return syncEngine.getMachine(machineId) ?? null
}

export function createManagedRunnerController(
    options: CreateManagedRunnerControllerOptions
): ManagedRunnerController {
    const isLocalProcessAlive = options.isLocalProcessAlive ?? defaultIsLocalProcessAlive
    const startManagedRunnerProcess = options.startRunnerProcess ?? startRunnerProcess
    const stopManagedRunnerProcess = options.stopRunnerProcess ?? stopRunnerProcess
    const stopManagedRunnerPid = options.stopRunnerPid ?? stopRunnerPid
    const waitUntilRunnerOnline = options.waitForRunnerOnline ?? waitForRunnerOnline
    const recoverRunner = options.recoverManagedRunner ?? recoverManagedRunner

    let activeRunner: ActiveRunnerBinding = null
    let runnerRestartPromise: Promise<void> | null = null
    let stopReusedRunnerWatch: (() => void) | null = null

    function clearReusedRunnerWatch(): void {
        stopReusedRunnerWatch?.()
        stopReusedRunnerWatch = null
    }

    function setActiveRunner(binding: Exclude<ActiveRunnerBinding, null>): void {
        clearReusedRunnerWatch()
        activeRunner = binding
    }

    function clearActiveRunner(): void {
        clearReusedRunnerWatch()
        activeRunner = null
    }

    function getActiveRunnerChild(): ChildProcess | null {
        return activeRunner?.kind === 'child' ? activeRunner.child : null
    }

    function getReusedRunnerMachineId(): string | null {
        return activeRunner?.kind === 'reused' ? activeRunner.machineId : null
    }

    async function writeRuntimeStatus(update: HubRuntimeStatusUpdate): Promise<void> {
        await options.writeRuntimeStatus(update)
    }

    async function cleanupManagedRunnerAfterFailure(): Promise<void> {
        const child = getActiveRunnerChild()
        clearActiveRunner()
        await stopManagedRunnerProcess(child).catch(() => {})
    }

    function buildRunnerRetryStatusMessage(context: RunnerRetryContext): string {
        const delaySeconds = Math.ceil(context.delayMs / 1000)
        if (context.exit) {
            return `本机连接异常中断，${delaySeconds} 秒后自动重连。`
        }

        return context.mode === 'startup'
            ? `本机连接启动失败，${delaySeconds} 秒后自动重试。`
            : `本机连接重连失败，${delaySeconds} 秒后重试。`
    }

    function logRunnerRetry(context: RunnerRetryContext): void {
        if (context.exit) {
            console.error(
                `[Runner] Process exited unexpectedly (code ${context.exit.code ?? 'unknown'}, signal ${context.exit.signal ?? 'none'})`
            )
            console.log(`[Runner] Restarting local machine connection in ${context.delayMs}ms`)
            return
        }

        const errorMessage = context.error instanceof Error ? context.error.message : String(context.error)
        const actionLabel = context.mode === 'startup' ? 'startup' : 'restart'
        console.error(`[Runner] ${actionLabel} failed: ${errorMessage}`)
        console.log(`[Runner] Retrying in ${context.delayMs}ms`)
    }

    function bindReusedRunnerWatch(machineId: string): void {
        const syncEngine = options.getSyncEngine()
        if (!syncEngine) {
            return
        }

        const maybeRestartReusedRunner = (): void => {
            if (options.isShuttingDown() || runnerRestartPromise) {
                return
            }

            const machine = syncEngine.getMachine(machineId)
            if (!shouldRestartReusedRunner(machine, isLocalProcessAlive)) {
                return
            }

            clearActiveRunner()
            console.warn('[Runner] Reused local machine connection disappeared; restarting managed runner')
            void scheduleRunnerRestart(null, null)
        }

        clearActiveRunner()
        activeRunner = { kind: 'reused', machineId }
        const unsubscribe = syncEngine.subscribe((event) => {
            if (event.type !== 'machine-updated' || event.machineId !== machineId) {
                return
            }

            maybeRestartReusedRunner()
        })
        const intervalId = setInterval(() => {
            maybeRestartReusedRunner()
        }, REUSED_RUNNER_WATCH_INTERVAL_MS)

        stopReusedRunnerWatch = () => {
            unsubscribe()
            clearInterval(intervalId)
            stopReusedRunnerWatch = null
        }
    }

    async function startManagedRunner(): Promise<void> {
        const syncEngine = options.getSyncEngine()
        if (!syncEngine) {
            throw new Error('Sync engine failed to initialize.')
        }

        clearActiveRunner()

        const child = startManagedRunnerProcess({ apiUrl: options.localHubUrl })
        setActiveRunner({ kind: 'child', child })
        console.log(`[Runner] Process spawned (PID ${child.pid ?? 'unknown'})`)

        const onlineRunner: RunnerOnlineResult = await waitUntilRunnerOnline({
            child,
            dataDir: options.dataDir,
            syncEngine
        })

        if (onlineRunner.ownership === 'reused') {
            bindReusedRunnerWatch(onlineRunner.machineId)
            return
        }

        child.on('exit', (code, signal) => {
            if (options.isShuttingDown() || getActiveRunnerChild() !== child) {
                return
            }

            clearActiveRunner()
            void scheduleRunnerRestart(code, signal)
        })
    }

    async function notifyRunnerRetry(context: RunnerRetryContext): Promise<void> {
        logRunnerRetry(context)
        await writeRuntimeStatus({
            phase: 'starting',
            preferredBrowserUrl: options.localHubUrl,
            message: options.buildStartingStatusMessage(buildRunnerRetryStatusMessage(context))
        })
    }

    async function handleManagedRunnerReady(mode: RunnerRecoveryMode): Promise<void> {
        if (mode === 'restart') {
            console.log('[Runner] Local machine connection restored')
        }

        await writeRuntimeStatus({
            phase: 'ready',
            preferredBrowserUrl: options.localHubUrl,
            message: options.buildReadyStatusMessage(
                mode === 'restart'
                    ? ['本机连接已重新接通。']
                    : undefined
            )
        })
    }

    async function runRunnerRecovery(
        mode: RunnerRecoveryMode,
        exit?: { code: number | null; signal: NodeJS.Signals | null }
    ): Promise<void> {
        runnerRestartPromise = recoverRunner({
            mode,
            exit,
            isShuttingDown: options.isShuttingDown,
            hasRunnerProcess: () => activeRunner !== null,
            startRunner: startManagedRunner,
            cleanupRunner: cleanupManagedRunnerAfterFailure,
            onRetryScheduled: notifyRunnerRetry,
            onRecovered: handleManagedRunnerReady
        }).finally(() => {
            runnerRestartPromise = null
        })

        await runnerRestartPromise
    }

    async function scheduleRunnerRestart(
        code: number | null,
        signal: NodeJS.Signals | null
    ): Promise<void> {
        if (runnerRestartPromise || options.isShuttingDown()) {
            return
        }

        clearReusedRunnerWatch()
        await runRunnerRecovery('restart', { code, signal })
    }

    async function startStartupRecovery(): Promise<void> {
        if (activeRunner || runnerRestartPromise) {
            if (runnerRestartPromise) {
                await runnerRestartPromise
            }
            return
        }

        await runRunnerRecovery('startup')
    }

    function onRuntimeReload(): void {
        const reusedRunnerMachineId = getReusedRunnerMachineId()
        if (!reusedRunnerMachineId) {
            return
        }

        bindReusedRunnerWatch(reusedRunnerMachineId)
    }

    async function stop(): Promise<string | null> {
        let runnerStopError: string | null = null
        const child = getActiveRunnerChild()
        const reusedRunnerPid = getMachineRunnerPid(
            readReusedRunnerMachine(options.getSyncEngine, getReusedRunnerMachineId())
        )

        runnerRestartPromise = null
        clearActiveRunner()

        try {
            if (child) {
                await stopManagedRunnerProcess(child)
            } else if (reusedRunnerPid !== null) {
                await stopManagedRunnerPid(reusedRunnerPid)
            }
        } catch (error) {
            runnerStopError = error instanceof Error ? error.message : String(error)
            console.error('[Runner] Failed to stop process:', runnerStopError)
        }

        return runnerStopError
    }

    return {
        startStartupRecovery,
        onRuntimeReload,
        stop
    }
}
