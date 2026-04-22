import type { RunnerRetryContext } from '../runner/supervisor'
import type { Machine, SyncEngine } from '../sync/syncEngine'

export function defaultIsLocalProcessAlive(pid: number): boolean {
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

export function readReusedRunnerMachine(
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

export function buildRunnerRetryStatusMessage(context: RunnerRetryContext): string {
    const delaySeconds = Math.ceil(context.delayMs / 1000)
    if (context.exit) {
        return `本机连接异常中断，${delaySeconds} 秒后自动重连。`
    }
    return context.mode === 'startup'
        ? `本机连接启动失败，${delaySeconds} 秒后自动重试。`
        : `本机连接重连失败，${delaySeconds} 秒后重试。`
}

export function logRunnerRetry(context: RunnerRetryContext): void {
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
