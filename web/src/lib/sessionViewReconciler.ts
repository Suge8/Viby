import type { QueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import { queryKeys } from '@/lib/query-keys'
import { writeSessionViewToQueryCache } from '@/lib/sessionQueryCache'

const inFlightSessionViewReconcileBySessionId = new Map<string, Promise<void>>()
const SELECTED_SESSION_RECONCILE_ABORT_MESSAGE = 'Selected session reconcile superseded'
let activeSelectedSessionReconcile: {
    sessionId: string
    signal: AbortSignal
    abort: (reason?: unknown) => void
} | null = null

function invalidateRealtimeQueries(queryClient: QueryClient): Array<Promise<unknown>> {
    return [
        queryClient.invalidateQueries({ queryKey: queryKeys.sessions }),
        queryClient.invalidateQueries({ queryKey: queryKeys.runtime }),
    ]
}

function isAbortError(error: unknown): boolean {
    if (error instanceof DOMException && error.name === 'AbortError') {
        return true
    }

    return error instanceof Error && error.name === 'AbortError'
}

function createSelectedSessionAbortReason(): Error {
    const error = new Error(SELECTED_SESSION_RECONCILE_ABORT_MESSAGE)
    error.name = 'AbortError'
    return error
}

function abortSupersededSelectedSessionReconcile(nextSessionId: string | null): void {
    if (!activeSelectedSessionReconcile || activeSelectedSessionReconcile.sessionId === nextSessionId) {
        return
    }

    activeSelectedSessionReconcile.abort(createSelectedSessionAbortReason())
    activeSelectedSessionReconcile = null
}

function beginSelectedSessionReconcile(sessionId: string): AbortSignal | undefined {
    abortSupersededSelectedSessionReconcile(sessionId)
    if (typeof AbortController === 'undefined') {
        return undefined
    }

    const controller = new AbortController()
    activeSelectedSessionReconcile = {
        sessionId,
        signal: controller.signal,
        abort: (reason?: unknown) => controller.abort(reason),
    }
    return controller.signal
}

function finishSelectedSessionReconcile(sessionId: string, signal: AbortSignal | undefined): void {
    if (!signal || !activeSelectedSessionReconcile) {
        return
    }
    if (activeSelectedSessionReconcile.sessionId !== sessionId || activeSelectedSessionReconcile.signal !== signal) {
        return
    }

    activeSelectedSessionReconcile = null
}

function runDedupedSessionViewReconcile(sessionId: string, task: () => Promise<void>): Promise<void> {
    const current = inFlightSessionViewReconcileBySessionId.get(sessionId)
    if (current) {
        return current
    }

    const next = task().finally(() => {
        if (inFlightSessionViewReconcileBySessionId.get(sessionId) === next) {
            inFlightSessionViewReconcileBySessionId.delete(sessionId)
        }
    })
    inFlightSessionViewReconcileBySessionId.set(sessionId, next)
    return next
}

export async function reconcileSessionView(options: {
    queryClient: QueryClient
    api: ApiClient | null
    selectedSessionId: string | null
}): Promise<void> {
    const tasks = invalidateRealtimeQueries(options.queryClient)

    if (!options.selectedSessionId || !options.api) {
        abortSupersededSelectedSessionReconcile(null)
        await Promise.all(tasks)
        return
    }

    tasks.push(
        runDedupedSessionViewReconcile(options.selectedSessionId, async () => {
            const sessionId = options.selectedSessionId!
            const signal = beginSelectedSessionReconcile(sessionId)

            try {
                const sessionView = await options.api!.getSessionView(sessionId, { signal })
                writeSessionViewToQueryCache(options.queryClient, sessionView)
            } catch (error) {
                if (!isAbortError(error)) {
                    throw error
                }
            } finally {
                finishSelectedSessionReconcile(sessionId, signal)
            }
        })
    )

    await Promise.all(tasks)
}
