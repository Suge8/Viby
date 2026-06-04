import type {
    TerminalErrorPayload,
    TerminalExitPayload,
    TerminalOutputPayload,
    TerminalReadyPayload,
} from '@viby/protocol'
import { logger } from '@/ui/logger'
import { getInvokedCwd } from '@/utils/invokedCwd'
import {
    buildFilteredEnv,
    getOptionalBun,
    normalizeTerminalInputForHost,
    resolveEnvNumber,
    resolveShellCommand,
} from './terminalHost'
import type { TerminalSession } from './types'

export { normalizeTerminalInputForHost, resolveShellCommand } from './terminalHost'

type TerminalRuntime = TerminalSession & {
    proc: Bun.Subprocess
    terminal: Bun.Terminal
    idleTimer: ReturnType<typeof setTimeout> | null
}

type TerminalManagerOptions = {
    sessionId: string
    getSessionPath: () => string | null
    onReady: (payload: TerminalReadyPayload) => void
    onOutput: (payload: TerminalOutputPayload) => void
    onExit: (payload: TerminalExitPayload) => void
    onError: (payload: TerminalErrorPayload) => void
    idleTimeoutMs?: number
    maxTerminals?: number
}

const DEFAULT_IDLE_TIMEOUT_MS = 15 * 60_000
const DEFAULT_MAX_TERMINALS = 4
export class TerminalManager {
    private readonly sessionId: string
    private readonly getSessionPath: () => string | null
    private readonly onReady: (payload: TerminalReadyPayload) => void
    private readonly onOutput: (payload: TerminalOutputPayload) => void
    private readonly onExit: (payload: TerminalExitPayload) => void
    private readonly onError: (payload: TerminalErrorPayload) => void
    private readonly idleTimeoutMs: number
    private readonly maxTerminals: number
    private readonly terminals: Map<string, TerminalRuntime> = new Map()
    private readonly filteredEnv: NodeJS.ProcessEnv

    constructor(options: TerminalManagerOptions) {
        this.sessionId = options.sessionId
        this.getSessionPath = options.getSessionPath
        this.onReady = options.onReady
        this.onOutput = options.onOutput
        this.onExit = options.onExit
        this.onError = options.onError
        this.idleTimeoutMs =
            options.idleTimeoutMs ?? resolveEnvNumber('VIBY_TERMINAL_IDLE_TIMEOUT_MS', DEFAULT_IDLE_TIMEOUT_MS)
        this.maxTerminals =
            options.maxTerminals ?? resolveEnvNumber('VIBY_TERMINAL_MAX_TERMINALS', DEFAULT_MAX_TERMINALS)
        this.filteredEnv = buildFilteredEnv()
    }

    create(terminalId: string, cols: number, rows: number): void {
        const existing = this.terminals.get(terminalId)
        if (existing) {
            existing.cols = cols
            existing.rows = rows
            existing.terminal.resize(cols, rows)
            this.markActivity(existing)
            this.onReady({ sessionId: this.sessionId, terminalId })
            return
        }

        if (this.terminals.size >= this.maxTerminals) {
            this.emitError(terminalId, `Too many terminals open (max ${this.maxTerminals}).`)
            return
        }

        const bun = getOptionalBun()
        if (!bun || typeof bun.spawn !== 'function') {
            this.emitError(terminalId, 'Terminal is unavailable in this runtime.')
            return
        }

        const sessionPath = this.getSessionPath() ?? getInvokedCwd()
        const shellCommand = resolveShellCommand()
        const decoder = new TextDecoder()

        try {
            const proc = bun.spawn(shellCommand, {
                cwd: sessionPath,
                env: this.filteredEnv,
                terminal: {
                    cols,
                    rows,
                    data: (terminal, data) => {
                        const text = decoder.decode(data, { stream: true })
                        if (text) {
                            this.onOutput({ sessionId: this.sessionId, terminalId, data: text })
                        }
                        const active = this.terminals.get(terminalId)
                        if (active) {
                            this.markActivity(active)
                        }
                    },
                    exit: (terminal, exitCode) => {
                        if (exitCode === 1) {
                            this.emitError(terminalId, 'Terminal stream closed unexpectedly.')
                        }
                    },
                },
                onExit: (subprocess, exitCode) => {
                    const signal = subprocess.signalCode ?? null
                    this.onExit({
                        sessionId: this.sessionId,
                        terminalId,
                        code: exitCode ?? null,
                        signal,
                    })
                    this.cleanup(terminalId)
                },
            })

            const terminal = proc.terminal
            if (!terminal) {
                try {
                    proc.kill()
                } catch (error) {
                    logger.debug('[TERMINAL] Failed to kill process after missing terminal', { error })
                }
                this.emitError(terminalId, 'Failed to attach terminal.')
                return
            }

            const runtime: TerminalRuntime = {
                terminalId,
                cols,
                rows,
                proc,
                terminal,
                idleTimer: null,
            }

            this.terminals.set(terminalId, runtime)
            this.markActivity(runtime)
            this.onReady({ sessionId: this.sessionId, terminalId })
        } catch (error) {
            logger.debug('[TERMINAL] Failed to spawn terminal', { error })
            const message =
                process.platform === 'win32' &&
                error instanceof Error &&
                error.message.includes('terminal option is not supported')
                    ? 'Remote terminal on Windows requires Bun 1.3.14 or newer.'
                    : 'Failed to spawn terminal.'
            this.emitError(terminalId, message)
        }
    }

    write(terminalId: string, data: string): void {
        const runtime = this.terminals.get(terminalId)
        if (!runtime) {
            this.emitError(terminalId, 'Terminal not found.')
            return
        }
        runtime.terminal.write(normalizeTerminalInputForHost(data))
        this.markActivity(runtime)
    }

    resize(terminalId: string, cols: number, rows: number): void {
        const runtime = this.terminals.get(terminalId)
        if (!runtime) {
            return
        }
        runtime.cols = cols
        runtime.rows = rows
        runtime.terminal.resize(cols, rows)
        this.markActivity(runtime)
    }

    close(terminalId: string): void {
        this.cleanup(terminalId)
    }

    closeAll(): void {
        for (const terminalId of this.terminals.keys()) {
            this.cleanup(terminalId)
        }
    }

    private markActivity(runtime: TerminalRuntime): void {
        this.scheduleIdleTimer(runtime)
    }

    private scheduleIdleTimer(runtime: TerminalRuntime): void {
        if (this.idleTimeoutMs <= 0) {
            return
        }

        if (runtime.idleTimer) {
            clearTimeout(runtime.idleTimer)
        }

        runtime.idleTimer = setTimeout(() => {
            this.emitError(runtime.terminalId, 'Terminal closed due to inactivity.')
            this.cleanup(runtime.terminalId)
        }, this.idleTimeoutMs)
    }

    private cleanup(terminalId: string): void {
        const runtime = this.terminals.get(terminalId)
        if (!runtime) {
            return
        }

        this.terminals.delete(terminalId)
        if (runtime.idleTimer) {
            clearTimeout(runtime.idleTimer)
        }

        if (!runtime.proc.killed && runtime.proc.exitCode === null) {
            try {
                runtime.proc.kill()
            } catch (error) {
                logger.debug('[TERMINAL] Failed to kill process', { error })
            }
        }

        try {
            runtime.terminal.close()
        } catch (error) {
            logger.debug('[TERMINAL] Failed to close terminal', { error })
        }
    }

    private emitError(terminalId: string, message: string): void {
        this.onError({ sessionId: this.sessionId, terminalId, message })
    }
}
