import axios, { type AxiosRequestConfig } from 'axios'
import { logger } from '@/ui/logger'
import { apiValidationError } from '@/utils/errorUtils'
import { isExternalSessionUserMessage, readObservedAutoSummary } from './apiSessionState'
import type { AgentState, Metadata, UserMessage } from './types'
import {
    AgentStateSchema,
    type CliSessionRecoveryResponse,
    CliSessionRecoveryResponseSchema,
    MetadataSchema,
    UserMessageSchema,
} from './types'

type RecoveryState = {
    metadata: Metadata | null
    metadataVersion: number
    agentState: AgentState | null
    agentStateVersion: number
    lastSeenMessageSeq: number | null
    backfillInFlight: Promise<void> | null
    needsBackfill: boolean
}

type RecoverSessionStateOptions = {
    state: RecoveryState
    fetchPage: (afterSeq: number) => Promise<CliSessionRecoveryResponse>
    handleIncomingMessage: (message: { seq?: number | null; content: unknown }) => void
}

export function handleIncomingSessionMessage(
    state: RecoveryState,
    message: { seq?: number | null; content: unknown },
    enqueueUserMessage: (message: UserMessage) => void,
    emitMessage: (content: unknown) => void,
    observeAutoSummary?: (summary: { text: string; updatedAt: number | null }) => void
): void {
    const seq = typeof message.seq === 'number' ? message.seq : null
    if (seq !== null) {
        if (state.lastSeenMessageSeq !== null && seq <= state.lastSeenMessageSeq) {
            return
        }
        state.lastSeenMessageSeq = seq
    }

    const summary = readObservedAutoSummary(message.content)
    if (summary) {
        observeAutoSummary?.(summary)
        return
    }

    const userResult = UserMessageSchema.safeParse(message.content)
    if (userResult.success) {
        if (isExternalSessionUserMessage(userResult.data)) {
            enqueueUserMessage(userResult.data)
        }
        return
    }

    emitMessage(message.content)
}

export async function recoverSessionState({
    state,
    fetchPage,
    handleIncomingMessage,
}: RecoverSessionStateOptions): Promise<void> {
    if (state.backfillInFlight) {
        await state.backfillInFlight
        return
    }

    const run = async () => {
        let cursor = state.lastSeenMessageSeq ?? 0
        while (true) {
            const recovery = await fetchPage(cursor)
            applyRecoveredSessionSnapshot(state, recovery.session)

            if (recovery.messages.length === 0) {
                return
            }

            for (const message of recovery.messages) {
                handleIncomingMessage(message)
            }

            const nextCursor = recovery.page.nextAfterSeq
            if (nextCursor <= cursor) {
                logger.debug('[API] Backfill stopped due to non-advancing cursor', {
                    cursor,
                    nextCursor,
                })
                return
            }

            cursor = nextCursor
            if (!recovery.page.hasMore) {
                return
            }
        }
    }

    state.backfillInFlight = run().finally(() => {
        state.backfillInFlight = null
    })

    await state.backfillInFlight
}

export async function backfillSessionStateIfNeeded(state: RecoveryState, recover: () => Promise<void>): Promise<void> {
    if (!state.needsBackfill) {
        return
    }

    try {
        await recover()
        state.needsBackfill = false
    } catch (error) {
        logger.debug('[API] Backfill failed', error)
        state.needsBackfill = true
    }
}

export async function fetchSessionRecoveryPage(
    sessionId: string,
    afterSeq: number,
    requestConfig: AxiosRequestConfig,
    apiUrl: string
): Promise<CliSessionRecoveryResponse> {
    const response = await axios.get(`${apiUrl}/cli/sessions/${encodeURIComponent(sessionId)}/recovery`, {
        ...requestConfig,
        params: {
            afterSeq,
            limit: typeof requestConfig.params?.limit === 'number' ? requestConfig.params.limit : 200,
        },
    })

    const result = CliSessionRecoveryResponseSchema.safeParse(response.data)
    if (!result.success) {
        throw apiValidationError('Invalid /cli/sessions/:id/recovery response', response)
    }

    return result.data
}

export function applyRecoveredSessionSnapshot(
    state: RecoveryState,
    session: CliSessionRecoveryResponse['session']
): void {
    const metadataResult = MetadataSchema.safeParse(session.metadata)
    const agentStateResult = session.agentState == null ? null : AgentStateSchema.safeParse(session.agentState)

    if (session.metadataVersion > state.metadataVersion) {
        if (metadataResult.success) {
            state.metadata = metadataResult.data
        }
        state.metadataVersion = session.metadataVersion
    }

    if (session.agentStateVersion > state.agentStateVersion) {
        if (session.agentState == null) {
            state.agentState = null
        } else if (agentStateResult?.success) {
            state.agentState = agentStateResult.data
        }
        state.agentStateVersion = session.agentStateVersion
    }
}

export type { RecoveryState }
