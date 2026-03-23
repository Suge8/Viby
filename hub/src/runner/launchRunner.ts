import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

import type { Machine, SyncEngine } from '../sync/syncEngine'
import { isBunCompiled } from '../utils/bunCompiled'

const RUNNER_READY_TIMEOUT_MS = 15_000
const RUNNER_READY_POLL_INTERVAL_MS = 200
const RUNNER_STOP_TIMEOUT_MS = 3_000
const RUNNER_PID_POLL_INTERVAL_MS = 50

type LaunchRunnerOptions = {
    apiUrl: string
}

type WaitForRunnerOnlineOptions = {
    child: ChildProcess
    dataDir: string
    syncEngine: SyncEngine
    timeoutMs?: number
    sleepMs?: (delayMs: number) => Promise<void>
}

export type RunnerOnlineResult = {
    machineId: string
    ownership: 'child' | 'reused'
}

function getCliEntrypoint(): string {
    const cliEntrypoint = join(import.meta.dir, '..', '..', '..', 'cli', 'src', 'index.ts')
    if (!existsSync(cliEntrypoint)) {
        throw new Error(`CLI entrypoint not found: ${cliEntrypoint}`)
    }
    return cliEntrypoint
}

function getCliProjectRoot(): string {
    return join(import.meta.dir, '..', '..', '..', 'cli')
}

function getRunnerSpawnCommand(): { command: string; args: string[] } {
    if (isBunCompiled()) {
        return {
            command: process.execPath,
            args: ['runner', 'start-sync']
        }
    }

    return {
        command: process.execPath,
        args: ['--cwd', getCliProjectRoot(), getCliEntrypoint(), 'runner', 'start-sync']
    }
}

export function startRunnerProcess(options: LaunchRunnerOptions): ChildProcess {
    const { command, args } = getRunnerSpawnCommand()
    return spawn(command, args, {
        detached: false,
        stdio: 'inherit',
        env: {
            ...process.env,
            VIBY_API_URL: options.apiUrl
        }
    })
}

function readRunnerPid(machine: Machine | null | undefined): number | null {
    if (!machine) {
        return null
    }
    const runnerState = machine.runnerState
    if (!runnerState || typeof runnerState !== 'object' || Array.isArray(runnerState)) {
        return null
    }

    const pid = (runnerState as { pid?: unknown }).pid
    return typeof pid === 'number' ? pid : null
}

function readRunnerStatus(machine: Machine | null | undefined): string | null {
    if (!machine) {
        return null
    }
    const runnerState = machine.runnerState
    if (!runnerState || typeof runnerState !== 'object' || Array.isArray(runnerState)) {
        return null
    }

    const status = (runnerState as { status?: unknown }).status
    return typeof status === 'string' ? status : null
}

function isManagedMachineReady(machine: Machine, childPid: number, dataDir: string): boolean {
    return machine.active
        && machine.metadata?.vibyHomeDir === dataDir
        && readRunnerPid(machine) === childPid
        && readRunnerStatus(machine) === 'running'
}

function isReusableManagedMachineReady(machine: Machine, dataDir: string): boolean {
    return machine.active
        && machine.metadata?.vibyHomeDir === dataDir
        && readRunnerStatus(machine) === 'running'
}

export function isMachineRunnerRunning(machine: Machine | null | undefined): boolean {
    return Boolean(machine?.active) && readRunnerStatus(machine) === 'running'
}

export function getMachineRunnerPid(machine: Machine | null | undefined): number | null {
    return readRunnerPid(machine)
}

function formatRunnerExit(code: number | null, signal: NodeJS.Signals | null): string {
    const codePart = code === null ? 'unknown' : String(code)
    const signalPart = signal ?? 'none'
    return `本机连接提前退出了（code=${codePart}, signal=${signalPart}）。`
}

async function waitForChildExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
    if (child.exitCode !== null || child.signalCode !== null) {
        return true
    }

    const exited = await Promise.race([
        once(child, 'exit').then(() => true),
        sleep(timeoutMs, false)
    ])
    return exited === true
}

function isValidRunnerPid(pid: number | null | undefined): pid is number {
    return typeof pid === 'number' && Number.isFinite(pid) && pid > 0
}

function isProcessAlive(pid: number): boolean {
    try {
        process.kill(pid, 0)
        return true
    } catch {
        return false
    }
}

async function waitForPidExit(
    pid: number,
    timeoutMs: number,
    sleepMs: (delayMs: number) => Promise<void>
): Promise<boolean> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        if (!isProcessAlive(pid)) {
            return true
        }
        await sleepMs(RUNNER_PID_POLL_INTERVAL_MS)
    }
    return !isProcessAlive(pid)
}

export async function waitForRunnerOnline(options: WaitForRunnerOnlineOptions): Promise<RunnerOnlineResult> {
    const { child, dataDir, syncEngine, timeoutMs = RUNNER_READY_TIMEOUT_MS } = options
    const sleepMs = options.sleepMs ?? sleep
    if (!child.pid) {
        throw new Error('无法启动本机连接。')
    }

    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        const onlineMachines = syncEngine.getOnlineMachines()
        const managedChildMachine = onlineMachines.find((machine) => isManagedMachineReady(machine, child.pid!, dataDir))
        if (managedChildMachine) {
            return {
                machineId: managedChildMachine.id,
                ownership: 'child'
            }
        }

        if (child.exitCode !== null || child.signalCode !== null) {
            const exitedCleanly = child.exitCode === 0 && child.signalCode === null
            if (!exitedCleanly) {
                throw new Error(formatRunnerExit(child.exitCode, child.signalCode))
            }

            const reusableRunnerMachine = onlineMachines.find((machine) => isReusableManagedMachineReady(machine, dataDir))
            if (reusableRunnerMachine) {
                return {
                    machineId: reusableRunnerMachine.id,
                    ownership: 'reused'
                }
            }
        }

        await sleepMs(RUNNER_READY_POLL_INTERVAL_MS)
    }

    throw new Error('这台机器没有在预期时间内连回中枢。')
}

export async function stopRunnerProcess(child: ChildProcess | null): Promise<void> {
    if (!child || child.exitCode !== null || child.signalCode !== null) {
        return
    }

    child.kill('SIGTERM')
    if (await waitForChildExit(child, RUNNER_STOP_TIMEOUT_MS)) {
        return
    }

    child.kill('SIGKILL')
    if (await waitForChildExit(child, RUNNER_STOP_TIMEOUT_MS)) {
        return
    }

    throw new Error('本机连接没有按预期退出。')
}

export async function stopRunnerPid(
    pid: number | null | undefined,
    options?: {
        timeoutMs?: number
        sleepMs?: (delayMs: number) => Promise<void>
    }
): Promise<void> {
    if (!isValidRunnerPid(pid) || !isProcessAlive(pid)) {
        return
    }

    const timeoutMs = options?.timeoutMs ?? RUNNER_STOP_TIMEOUT_MS
    const sleepMs = options?.sleepMs ?? sleep

    process.kill(pid, 'SIGTERM')
    if (await waitForPidExit(pid, timeoutMs, sleepMs)) {
        return
    }

    process.kill(pid, 'SIGKILL')
    if (await waitForPidExit(pid, timeoutMs, sleepMs)) {
        return
    }

    throw new Error('复用的本机连接没有按预期退出。')
}
