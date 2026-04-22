import { existsSync, readdirSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import chalk from 'chalk'
import { appendFileSync } from 'fs'
import { configuration } from '@/configuration'
import { readRunnerState } from '@/persistence'

function createTimestampForFilename(date: Date = new Date()): string {
    return (
        date
            .toLocaleString('sv-SE', {
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
            })
            .replace(/[: ]/g, '-')
            .replace(/,/g, '') +
        '-pid-' +
        process.pid
    )
}

function createTimestampForLogEntry(date: Date = new Date()): string {
    return date.toLocaleTimeString('en-US', {
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3,
    })
}

function getSessionLogPath(): string {
    const timestamp = createTimestampForFilename()
    const filename = configuration.isRunnerProcess ? `${timestamp}-runner.log` : `${timestamp}.log`
    return join(configuration.logsDir, filename)
}

class Logger {
    private dangerouslyUnencryptedServerLoggingUrl: string | undefined

    constructor(public readonly logFilePath = getSessionLogPath()) {
        if (process.env.DANGEROUSLY_LOG_TO_SERVER_FOR_AI_AUTO_DEBUGGING && process.env.VIBY_API_URL) {
            this.dangerouslyUnencryptedServerLoggingUrl = process.env.VIBY_API_URL
            console.log(chalk.yellow('[REMOTE LOGGING] Sending logs to server for AI debugging'))
        }
    }

    localTimezoneTimestamp(): string {
        return createTimestampForLogEntry()
    }

    debug(message: string, ...args: unknown[]): void {
        this.logToFile(`[${this.localTimezoneTimestamp()}]`, message, ...args)
    }

    debugLargeJson(message: string, object: unknown, maxStringLength: number = 100, maxArrayLength: number = 10): void {
        if (!process.env.DEBUG) {
            this.debug(`In production, skipping message inspection`)
        }

        const truncateStrings = (obj: unknown): unknown => {
            if (typeof obj === 'string') {
                return obj.length > maxStringLength
                    ? obj.substring(0, maxStringLength) + '... [truncated for logs]'
                    : obj
            }

            if (Array.isArray(obj)) {
                const truncatedArray = obj.map((item) => truncateStrings(item)).slice(0, maxArrayLength)
                if (obj.length > maxArrayLength) {
                    truncatedArray.push(`... [truncated array for logs up to ${maxArrayLength} items]` as unknown)
                }
                return truncatedArray
            }

            if (obj && typeof obj === 'object') {
                const result: Record<string, unknown> = {}
                for (const [key, value] of Object.entries(obj)) {
                    if (key === 'usage') {
                        continue
                    }
                    result[key] = truncateStrings(value)
                }
                return result
            }

            return obj
        }

        const truncatedObject = truncateStrings(object)
        const json = JSON.stringify(truncatedObject, null, 2)
        this.logToFile(`[${this.localTimezoneTimestamp()}]`, message, '\n', json)
    }

    info(message: string, ...args: unknown[]): void {
        this.logToConsole('info', '', message, ...args)
        this.debug(message, args)
    }

    infoDeveloper(message: string, ...args: unknown[]): void {
        this.debug(message, ...args)
        if (process.env.DEBUG) {
            this.logToConsole('info', '[DEV]', message, ...args)
        }
    }

    warn(message: string, ...args: unknown[]): void {
        this.logToConsole('warn', '', message, ...args)
        this.debug(`[WARN] ${message}`, ...args)
    }

    getLogPath(): string {
        return this.logFilePath
    }

    private logToConsole(
        level: 'debug' | 'error' | 'info' | 'warn',
        prefix: string,
        message: string,
        ...args: unknown[]
    ): void {
        switch (level) {
            case 'debug': {
                console.log(chalk.gray(prefix), message, ...args)
                break
            }

            case 'error': {
                console.error(chalk.red(prefix), message, ...args)
                break
            }

            case 'info': {
                console.log(chalk.blue(prefix), message, ...args)
                break
            }

            case 'warn': {
                console.log(chalk.yellow(prefix), message, ...args)
                break
            }

            default: {
                this.debug('Unknown log level:', level)
                console.log(chalk.blue(prefix), message, ...args)
                break
            }
        }
    }

    private async sendToRemoteServer(level: string, message: string, ...args: unknown[]): Promise<void> {
        if (!this.dangerouslyUnencryptedServerLoggingUrl) return

        try {
            await fetch(
                this.dangerouslyUnencryptedServerLoggingUrl +
                    '/logs-combined-from-cli-and-mobile-for-simple-ai-debugging',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        timestamp: new Date().toISOString(),
                        level,
                        message: `${message} ${args
                            .map((a) => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)))
                            .join(' ')}`,
                        source: 'cli',
                        platform: process.platform,
                    }),
                }
            )
        } catch (error) {}
    }

    private logToFile(prefix: string, message: string, ...args: unknown[]): void {
        const logLine = `${prefix} ${message} ${args
            .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
            .join(' ')}\n`

        if (this.dangerouslyUnencryptedServerLoggingUrl) {
            let level = 'info'
            if (prefix.includes(this.localTimezoneTimestamp())) {
                level = 'debug'
            }
            this.sendToRemoteServer(level, message, ...args).catch((error) => {
                this.debug('Remote logging failed', error)
            })
        }
        try {
            appendFileSync(this.logFilePath, logLine)
        } catch (appendError) {
            if (process.env.DEBUG) {
                console.error('[DEV MODE ONLY THROWING] Failed to append to log file:', appendError)
                throw appendError
            }
        }
    }
}

export let logger = new Logger()

export type LogFileInfo = {
    file: string
    path: string
    modified: Date
}

export async function listRunnerLogFiles(limit: number = 50): Promise<LogFileInfo[]> {
    try {
        const logsDir = configuration.logsDir
        if (!existsSync(logsDir)) {
            return []
        }

        const logs = readdirSync(logsDir)
            .filter((file) => file.endsWith('-runner.log'))
            .map((file) => {
                const fullPath = join(logsDir, file)
                const stats = statSync(fullPath)
                return { file, path: fullPath, modified: stats.mtime } as LogFileInfo
            })
            .sort((a, b) => b.modified.getTime() - a.modified.getTime())

        try {
            const state = await readRunnerState()

            if (!state) {
                return logs
            }

            if (state.runnerLogPath && existsSync(state.runnerLogPath)) {
                const stats = statSync(state.runnerLogPath)
                const persisted: LogFileInfo = {
                    file: basename(state.runnerLogPath),
                    path: state.runnerLogPath,
                    modified: stats.mtime,
                }
                const idx = logs.findIndex((l) => l.path === persisted.path)
                if (idx >= 0) {
                    const [found] = logs.splice(idx, 1)
                    logs.unshift(found)
                } else {
                    logs.unshift(persisted)
                }
            }
        } catch {}

        return logs.slice(0, Math.max(0, limit))
    } catch {
        return []
    }
}

export async function getLatestRunnerLog(): Promise<LogFileInfo | null> {
    const [latest] = await listRunnerLogFiles(1)
    return latest || null
}
