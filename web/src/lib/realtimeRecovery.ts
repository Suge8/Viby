import { SESSION_RECOVERY_PAGE_SIZE, findNextRecoveryCursor } from '@viby/protocol'
import type { QueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import {
    fetchLatestMessages,
    ingestIncomingMessages,
    getMessageWindowState
} from '@/lib/message-window-store'
import { queryKeys } from '@/lib/query-keys'

type RunRealtimeRecoveryOptions = {
    queryClient: QueryClient
    api: ApiClient | null
    selectedSessionId: string | null
}

function invalidateRealtimeQueries(queryClient: QueryClient): Array<Promise<unknown>> {
    return [
        queryClient.invalidateQueries({ queryKey: queryKeys.sessions }),
        queryClient.invalidateQueries({ queryKey: queryKeys.machines })
    ]
}

export async function runRealtimeRecovery(options: RunRealtimeRecoveryOptions): Promise<void> {
    const tasks = invalidateRealtimeQueries(options.queryClient)

    if (!options.selectedSessionId || !options.api) {
        await Promise.all(tasks)
        return
    }

    tasks.push(recoverSelectedSession(options))

    await Promise.all(tasks)
}

async function recoverSelectedSession(options: RunRealtimeRecoveryOptions): Promise<void> {
    if (!options.selectedSessionId || !options.api) {
        return
    }

    const sessionId = options.selectedSessionId
    const sessionQueryKey = queryKeys.session(sessionId)
    options.queryClient.invalidateQueries({ queryKey: sessionQueryKey })

    const currentState = getMessageWindowState(sessionId)
    if (typeof currentState.newestSeq !== 'number') {
        await fetchLatestMessages(options.api, sessionId)
        return
    }

    let cursor = currentState.newestSeq
    let latestSessionWritten = false

    while (true) {
        const recovery = await options.api.getSessionRecovery(sessionId, {
            afterSeq: cursor,
            limit: SESSION_RECOVERY_PAGE_SIZE
        })

        if (!latestSessionWritten) {
            options.queryClient.setQueryData(sessionQueryKey, {
                session: recovery.session
            })
            latestSessionWritten = true
        }

        if (recovery.messages.length === 0) {
            return
        }

        ingestIncomingMessages(sessionId, recovery.messages)

        const nextCursor = findNextRecoveryCursor(recovery.messages, cursor)
        if (!recovery.page.hasMore || nextCursor <= cursor) {
            return
        }

        cursor = nextCursor
    }
}
