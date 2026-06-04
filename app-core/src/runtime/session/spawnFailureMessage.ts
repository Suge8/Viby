import { logger } from '@/ui/logger'

const MAX_TAIL_CHARS = 4000
const MAX_MESSAGE_TAIL_CHARS = 800

export type SpawnExitSnapshot = {
    exitCode: number | null
    signal: NodeJS.Signals | null
}

export type SpawnStartFailureReason =
    | 'timeout'
    | 'exit-before-session-start event'
    | 'process-error-before-session-start event'

export function createStderrTail() {
    let value = ''
    return {
        append(chunk: Buffer | string): void {
            const text = chunk.toString()
            if (!text) return
            const combined = value + text
            value = combined.length > MAX_TAIL_CHARS ? combined.slice(-MAX_TAIL_CHARS) : combined
        },
        log(): void {
            const trimmed = value.trim()
            if (trimmed) logger.debug('[RuntimeSupervisor] Child stderr tail', trimmed)
        },
        readForMessage(): string | null {
            const compact = value.trim().replace(/\s+/g, ' ')
            if (!compact) return null
            return compact.length > MAX_MESSAGE_TAIL_CHARS ? compact.slice(-MAX_MESSAGE_TAIL_CHARS) : compact
        },
    }
}

export function buildSessionStartFailureMessage(options: {
    pid: number
    reason: SpawnStartFailureReason
    stderrTail: string | null
    exit: SpawnExitSnapshot
}): string {
    let message = readBaseMessage(options.reason, options.pid)
    if (options.exit.exitCode !== null || options.exit.signal) {
        message +=
            options.exit.exitCode !== null
                ? ` (exit code ${options.exit.exitCode})`
                : ` (signal ${options.exit.signal})`
    }
    if (options.stderrTail) message += `. stderr: ${options.stderrTail}`
    return message
}

function readBaseMessage(reason: SpawnStartFailureReason, pid: number): string {
    if (reason === 'timeout') return `Session session-start event timeout for PID ${pid}`
    if (reason === 'process-error-before-session-start event') {
        return `Session process error before session-start event for PID ${pid}`
    }
    return `Session process exited before session-start event for PID ${pid}`
}
