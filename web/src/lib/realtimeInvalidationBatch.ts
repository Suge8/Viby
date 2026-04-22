import type { QueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'

const INVALIDATION_BATCH_MS = 16

type PendingInvalidations = {
    sessions: boolean
    runtime: boolean
    sessionIds: Set<string>
    commandCapabilitySessionIds: Set<string>
}

export type RealtimeInvalidationBatch = {
    queueSessions: () => void
    queueRuntime: () => void
    queueSession: (sessionId: string) => void
    queueCommandCapabilities: (sessionId: string) => void
    dispose: () => void
}

type InvalidationHandle =
    | { kind: 'animation-frame'; id: number }
    | { kind: 'timeout'; id: ReturnType<typeof setTimeout> }

function scheduleInvalidationFlush(callback: () => void): InvalidationHandle {
    if (typeof globalThis.requestAnimationFrame === 'function') {
        return {
            kind: 'animation-frame',
            id: globalThis.requestAnimationFrame(callback),
        }
    }

    return {
        kind: 'timeout',
        id: setTimeout(callback, INVALIDATION_BATCH_MS),
    }
}

function cancelInvalidationFlush(handle: InvalidationHandle): void {
    if (handle.kind === 'animation-frame') {
        globalThis.cancelAnimationFrame?.(handle.id)
        return
    }

    clearTimeout(handle.id)
}

function invalidateQueryLazily(queryClient: QueryClient, queryKey: readonly unknown[]): Promise<void> {
    return queryClient.invalidateQueries({
        queryKey,
        refetchType: 'none',
    })
}

export function createRealtimeInvalidationBatch(options: {
    queryClient: QueryClient
    onError: (error: unknown) => void
}): RealtimeInvalidationBatch {
    let invalidationHandle: InvalidationHandle | null = null
    const pending: PendingInvalidations = {
        sessions: false,
        runtime: false,
        sessionIds: new Set<string>(),
        commandCapabilitySessionIds: new Set<string>(),
    }

    const clearPending = (): void => {
        pending.sessions = false
        pending.runtime = false
        pending.sessionIds.clear()
        pending.commandCapabilitySessionIds.clear()
    }

    const flush = (): void => {
        if (
            !pending.sessions &&
            !pending.runtime &&
            pending.sessionIds.size === 0 &&
            pending.commandCapabilitySessionIds.size === 0
        ) {
            return
        }

        const tasks: Array<Promise<unknown>> = []
        if (pending.sessions) {
            tasks.push(options.queryClient.invalidateQueries({ queryKey: queryKeys.sessions }))
        }
        for (const sessionId of pending.sessionIds) {
            tasks.push(options.queryClient.invalidateQueries({ queryKey: queryKeys.session(sessionId) }))
        }
        for (const sessionId of pending.commandCapabilitySessionIds) {
            tasks.push(invalidateQueryLazily(options.queryClient, queryKeys.commandCapabilities(sessionId)))
        }
        if (pending.runtime) {
            tasks.push(options.queryClient.invalidateQueries({ queryKey: queryKeys.runtime }))
        }

        clearPending()

        if (tasks.length > 0) {
            Promise.all(tasks).catch(options.onError)
        }
    }

    const schedule = (): void => {
        if (invalidationHandle) {
            return
        }

        invalidationHandle = scheduleInvalidationFlush(() => {
            invalidationHandle = null
            flush()
        })
    }

    return {
        queueSessions: () => {
            pending.sessions = true
            schedule()
        },
        queueRuntime: () => {
            pending.runtime = true
            schedule()
        },
        queueSession: (sessionId: string) => {
            pending.sessionIds.add(sessionId)
            schedule()
        },
        queueCommandCapabilities: (sessionId: string) => {
            pending.commandCapabilitySessionIds.add(sessionId)
            schedule()
        },
        dispose: () => {
            if (invalidationHandle) {
                cancelInvalidationFlush(invalidationHandle)
                invalidationHandle = null
            }
            clearPending()
        },
    }
}
