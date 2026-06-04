import { logger } from '@/ui/logger'
import type { CodexAppServerClient } from './codexAppServerClient'
import {
    APP_CORE_RESUME_WARMUP_MAX_ATTEMPTS,
    asRecord,
    type CodexRemoteRuntimeState,
    delay,
    extractNotificationThreadId,
    extractNotificationTurnId,
    getResumeWarmupRetryDelayMs,
    isAbortSuppressedNotificationMethod,
    requiresSynchronousResumeWarmup,
    shouldRetryResumeWarmup,
} from './codexRemoteSupport'
import type { CodexSession } from './session'
import type { AppServerEventConverter } from './utils/appServerEventConverter'
import { getCodexThreadMode } from './utils/threadWarmup'

export function registerCodexNotificationHandler(options: {
    appServerClient: CodexAppServerClient
    state: CodexRemoteRuntimeState
    appServerEventConverter: AppServerEventConverter
    handleCodexEvent: (event: Record<string, unknown>) => void
}): void {
    const { appServerClient, state, appServerEventConverter, handleCodexEvent } = options

    appServerClient.setNotificationHandler((method, params) => {
        if (state.suppressAnonymousTurnEvents && isAbortSuppressedNotificationMethod(method)) {
            logger.debug(`[Codex] Suppressing raw notification during abort: ${method}`)
            return
        }

        const notificationThreadId = extractNotificationThreadId(params)
        if (state.currentThreadId && notificationThreadId && notificationThreadId !== state.currentThreadId) {
            trackChildTurn(state, method, params, notificationThreadId)
            logger.debug(
                `[Codex] Ignoring notification for non-current thread ${notificationThreadId}; ` +
                    `active=${state.currentThreadId}; method=${method}`
            )
            return
        }

        for (const event of appServerEventConverter.handleNotification(method, params)) {
            handleCodexEvent(asRecord(event) ?? { type: undefined })
        }
    })
}

function trackChildTurn(state: CodexRemoteRuntimeState, method: string, params: unknown, threadId: string): void {
    if (!state.turnInFlight) {
        return
    }

    if (method === 'turn/started') {
        const turnId = extractNotificationTurnId(params)
        if (turnId) {
            state.activeChildTurns.set(threadId, turnId)
        }
        return
    }

    if (method === 'turn/completed' || method === 'error') {
        state.activeChildTurns.delete(threadId)
    }
}

export async function warmupCodexRemoteThread(options: {
    session: CodexSession
    state: CodexRemoteRuntimeState
    ensureThreadReady: (logIfMissing: boolean) => Promise<string>
    resetThreadState: () => void
}): Promise<void> {
    const requiresResumeWarmup = requiresSynchronousResumeWarmup(options.session)
    let initialWarmupError: unknown = null
    const attemptLimit = requiresResumeWarmup ? APP_CORE_RESUME_WARMUP_MAX_ATTEMPTS : 1

    for (let attempt = 1; attempt <= attemptLimit; attempt += 1) {
        try {
            options.state.currentThreadId = await options.ensureThreadReady(attempt > 1)
            initialWarmupError = null
            break
        } catch (error) {
            initialWarmupError = error
            options.resetThreadState()

            if (!requiresResumeWarmup) {
                logger.warn('[Codex] Initial remote warmup failed; will retry on first turn', error)
                break
            }

            if (shouldRetryResumeWarmup({ requiresResumeWarmup, attempt, maxAttempts: attemptLimit })) {
                logger.warn(`[Codex] Resume warmup attempt ${attempt}/${attemptLimit} failed; retrying`, error)
                await delay(getResumeWarmupRetryDelayMs(attempt))
                continue
            }
        }
    }

    if (requiresResumeWarmup && initialWarmupError) {
        throw initialWarmupError
    }
}
