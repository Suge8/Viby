import { logger } from '@/ui/logger'
import type { EnhancedMode } from './loop'
import type { CodexSession } from './session'
import { ensureCodexThreadStarted } from './utils/threadWarmup'

export async function ensureCodexRemoteThreadReady(options: {
    session: CodexSession
    appServerClient: {}
    mode: EnhancedMode
    abortSignal: AbortSignal
    currentThreadId: string | null
    hasThread: boolean
    logIfMissing?: boolean
    onModelResolved: (model: string) => void
    onThreadReady: (threadId: string) => void
}): Promise<string> {
    if (options.currentThreadId && options.hasThread) {
        return options.currentThreadId
    }

    if (!options.currentThreadId && options.logIfMissing) {
        logger.debug('[Codex] Missing thread id; restarting app-server thread')
    }

    const threadId = await ensureCodexThreadStarted({
        session: options.session,
        appServerClient: options.appServerClient as never,
        mode: options.mode,
        abortSignal: options.abortSignal,
        onModelResolved: (value) => {
            if (typeof value !== 'string' || value.length === 0) {
                return undefined
            }
            options.onModelResolved(value)
            logger.debug(`[Codex] Resolved app-server model: ${value}`)
            return value
        },
    })
    options.onThreadReady(threadId)
    return threadId
}
