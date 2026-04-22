import {
    getSessionResumeToken,
    resolveSessionDriver,
    type SessionDriver,
    type SessionHandoffSnapshot,
} from '@viby/protocol'
import type { Session } from '@viby/protocol/types'
import type { RpcGateway } from './rpcGateway'
import type { SessionCache } from './sessionCache'
import { isMissingKillSessionHandler, isSessionStateEvent, withSessionResumeToken } from './sessionSpawnContracts'
import type { ResumeContractState, SessionStateResolver } from './sessionSpawnSupportTypes'

export function getSpawnSupportSession(sessionCache: SessionCache, sessionId: string): Session | undefined {
    return sessionCache.getSession(sessionId) ?? sessionCache.refreshSession(sessionId) ?? undefined
}

export async function waitForSpawnSupportSessionState<T>(
    sessionCache: SessionCache,
    sessionId: string,
    options: {
        timeoutMs: number
        resolveValue: SessionStateResolver<T>
        onTimeout: () => T
    }
): Promise<T> {
    return await sessionCache.waitForSessionCondition(sessionId, {
        ...options,
        isRelevantEvent: isSessionStateEvent,
    })
}

export function buildResumeContinuityHandoffSnapshot(
    sessionId: string,
    buildSessionHandoff: (sessionId: string) => SessionHandoffSnapshot
): SessionHandoffSnapshot | string {
    try {
        return buildSessionHandoff(sessionId)
    } catch (error) {
        return error instanceof Error ? error.message : 'Failed to build session continuity handoff'
    }
}

export async function cleanupFailedResumeSpawn(options: {
    originalSessionId: string
    resumeToken: string
    rpcGateway: RpcGateway
    sessionCache: SessionCache
    spawnedSessionId: string
}): Promise<string | null> {
    const cleanupErrors: string[] = []

    try {
        await options.rpcGateway.killSession(options.spawnedSessionId)
    } catch (error) {
        if (!isMissingKillSessionHandler(error, options.spawnedSessionId)) {
            cleanupErrors.push(error instanceof Error ? error.message : 'Failed to kill spawned session')
        }
    }

    options.sessionCache.handleSessionEnd({ sid: options.spawnedSessionId, time: Date.now() })

    if (options.spawnedSessionId === options.originalSessionId) {
        try {
            await options.sessionCache.setSessionLifecycleState(options.spawnedSessionId, 'closed', {
                touchUpdatedAt: false,
            })
        } catch (error) {
            cleanupErrors.push(error instanceof Error ? error.message : 'Failed to close resumed session after cleanup')
        }
    } else {
        try {
            await options.sessionCache.deleteSession(options.spawnedSessionId)
        } catch (error) {
            cleanupErrors.push(
                error instanceof Error ? error.message : 'Failed to delete spawned session after cleanup'
            )
        }
    }

    try {
        await options.sessionCache.mutateSessionMetadata(
            options.originalSessionId,
            (currentMetadata) => withSessionResumeToken(currentMetadata, options.resumeToken) ?? currentMetadata,
            { touchUpdatedAt: false }
        )
    } catch (error) {
        cleanupErrors.push(error instanceof Error ? error.message : 'Failed to restore resume token after cleanup')
    }

    return cleanupErrors.length > 0 ? cleanupErrors.join('; ') : null
}

export async function waitForResumedSessionContractState(options: {
    getSession: (sessionId: string) => Session | undefined
    sessionCache: SessionCache
    sessionId: string
    resumeToken: string
    timeoutMs: number
}): Promise<ResumeContractState> {
    let hasBecomeActive = false

    const resolveState = (): ResumeContractState | null => {
        const session = options.getSession(options.sessionId)
        const resumedToken = session ? getSessionResumeToken(session.metadata) : undefined

        if (session?.active) {
            hasBecomeActive = true
            if (resumedToken === options.resumeToken) {
                return 'ready'
            }
            if (resumedToken && resumedToken !== options.resumeToken) {
                return 'token_mismatch'
            }
        } else if (hasBecomeActive) {
            return 'inactive_after_spawn'
        }

        return null
    }

    const immediateState = resolveState()
    if (immediateState) {
        return immediateState
    }

    return await waitForSpawnSupportSessionState(options.sessionCache, options.sessionId, {
        timeoutMs: options.timeoutMs,
        resolveValue: () => resolveState(),
        onTimeout: () => 'timeout',
    })
}

export async function waitForDriverSwitchState(options: {
    sessionId: string
    timeoutMs: number
    sessionCache: SessionCache
    getSession: (sessionId: string) => Session | undefined
    target: 'attached' | 'stopped'
}): Promise<'attached' | 'stopped' | 'timeout'> {
    const session = options.getSession(options.sessionId)
    if (options.target === 'attached') {
        if (session?.active) {
            return 'attached'
        }
        return await waitForSpawnSupportSessionState(options.sessionCache, options.sessionId, {
            timeoutMs: options.timeoutMs,
            resolveValue: (currentSession) => (currentSession?.active ? 'attached' : null),
            onTimeout: () => 'timeout',
        })
    }

    if (!session?.active) {
        return 'stopped'
    }
    return await waitForSpawnSupportSessionState(options.sessionCache, options.sessionId, {
        timeoutMs: options.timeoutMs,
        resolveValue: (currentSession) => (currentSession?.active ? null : 'stopped'),
        onTimeout: () => 'timeout',
    })
}

export async function rollbackDriverSwitchMetadataState(options: {
    sessionId: string
    previousDriver: SessionDriver | null
    sessionCache: SessionCache
    getSession: (sessionId: string) => Session | undefined
}): Promise<'not_started' | 'not_needed' | 'session_metadata_restored' | 'session_metadata_restore_failed'> {
    const session = options.getSession(options.sessionId)
    if ((resolveSessionDriver(session?.metadata) ?? null) === options.previousDriver) {
        return 'not_needed'
    }

    try {
        await options.sessionCache.mutateSessionMetadata(
            options.sessionId,
            (currentMetadata) => {
                if (!options.previousDriver) {
                    return {
                        ...currentMetadata,
                        driver: undefined,
                    }
                }

                return {
                    ...currentMetadata,
                    driver: options.previousDriver,
                }
            },
            {
                touchUpdatedAt: false,
            }
        )
        return 'session_metadata_restored'
    } catch {
        return 'session_metadata_restore_failed'
    }
}

export async function cleanupUnexpectedSwitchSpawnState(options: {
    originalSessionId: string
    rpcGateway: RpcGateway
    sessionCache: SessionCache
    spawnedSessionId: string
}): Promise<void> {
    try {
        await options.rpcGateway.killSession(options.spawnedSessionId)
    } catch {}

    options.sessionCache.handleSessionEnd({ sid: options.spawnedSessionId, time: Date.now() })
    if (options.spawnedSessionId !== options.originalSessionId) {
        try {
            await options.sessionCache.deleteSession(options.spawnedSessionId)
        } catch {}
    }
}
