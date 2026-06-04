import { findNextRecoveryCursor, SESSION_RECOVERY_PAGE_SIZE } from '@viby/protocol'
import type { ApiClient } from '@/api/api'
import type { PiPermissionMode, SessionModel, SessionModelReasoningEffort } from '@/api/types'
import { hashObject } from '@/utils/deterministicJson'
import { formatPiModel, type PiMessage, rehydratePiMessages } from './messageCodec'
import type { PiRpcState } from './piRpcClient'
import type { PiSession } from './session'
import type { PiMode } from './types'

export type PiRuntimeState = {
    permissionMode: PiPermissionMode
    model: SessionModel
    modelReasoningEffort: SessionModelReasoningEffort
}

type RecoveryMessagePage = Awaited<ReturnType<ApiClient['getSessionRecoveryPage']>>

export async function recoverPiMessages(api: ApiClient, vibySessionId: string | undefined): Promise<PiMessage[]> {
    if (!vibySessionId) {
        return []
    }

    const recoveredMessages: RecoveryMessagePage['messages'] = []
    let cursor = 0
    while (true) {
        const recoveryPage = await api.getSessionRecoveryPage({
            sessionId: vibySessionId,
            afterSeq: cursor,
            limit: SESSION_RECOVERY_PAGE_SIZE,
        })
        if (recoveryPage.messages.length === 0) {
            break
        }
        recoveredMessages.push(...recoveryPage.messages)
        const nextCursor = findNextRecoveryCursor(recoveryPage.messages, cursor)
        if (nextCursor <= cursor || !recoveryPage.page.hasMore) {
            break
        }
        cursor = nextCursor
    }

    return rehydratePiMessages(recoveredMessages)
}

export function createModeHash(mode: PiMode): string {
    return hashObject({
        permissionMode: mode.permissionMode,
        model: mode.model,
        modelReasoningEffort: mode.modelReasoningEffort,
    })
}

export function getRuntimeStateFromPiState(permissionMode: PiPermissionMode, state: PiRpcState): PiRuntimeState {
    return {
        permissionMode,
        model: formatPiModel(state.model),
        modelReasoningEffort: state.thinkingLevel === 'off' ? 'none' : state.thinkingLevel,
    }
}

export function syncRuntimeSnapshot(session: PiSession, runtimeState: PiRuntimeState): void {
    session.setPermissionMode(runtimeState.permissionMode)
    session.setModel(runtimeState.model)
    session.setModelReasoningEffort(runtimeState.modelReasoningEffort)
}
