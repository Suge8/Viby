import { findNextRecoveryCursor, SESSION_RECOVERY_PAGE_SIZE } from '@viby/protocol'
import type { ApiClient } from '@/api/api'
import type { PiPermissionMode, SessionModel, SessionModelReasoningEffort } from '@/api/types'
import { hashObject } from '@/utils/deterministicJson'
import {
    clampPiThinkingLevel,
    formatPiModel,
    fromPiThinkingLevel,
    type PiMessage,
    type PiThinkingLevel,
    rehydratePiMessages,
} from './messageCodec'
import type { PiSdkModel, PiSdkSession, PiSdkSessionManager } from './runPiSupportTypes'
import type { PiSession } from './session'
import type { PiMode } from './types'

export type PiRuntimeState = {
    permissionMode: PiPermissionMode
    model: SessionModel
    modelReasoningEffort: SessionModelReasoningEffort
}

type RecoveryMessagePage = Awaited<ReturnType<ApiClient['getSessionRecoveryPage']>>

function asPiThinkingLevels(levels: readonly string[]): readonly PiThinkingLevel[] {
    return levels as readonly PiThinkingLevel[]
}

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

export function preloadRecoveredMessages(sessionManager: PiSdkSessionManager, recoveredMessages: PiMessage[]): void {
    for (const message of recoveredMessages) {
        sessionManager.appendMessage(message as Parameters<PiSdkSessionManager['appendMessage']>[0])
    }
}

export function createModeHash(mode: PiMode): string {
    return hashObject({
        permissionMode: mode.permissionMode,
        model: mode.model,
        modelReasoningEffort: mode.modelReasoningEffort,
    })
}

export function getRuntimeStateFromPiSession(permissionMode: PiPermissionMode, session: PiSdkSession): PiRuntimeState {
    return {
        permissionMode,
        model: formatPiModel(session.model),
        modelReasoningEffort: fromPiThinkingLevel(session.thinkingLevel),
    }
}

export function syncRuntimeSnapshot(session: PiSession, runtimeState: PiRuntimeState): void {
    session.setPermissionMode(runtimeState.permissionMode)
    session.setModel(runtimeState.model)
    session.setModelReasoningEffort(runtimeState.modelReasoningEffort)
}

export function applyThinkingLevel(session: PiSdkSession, requestedLevel: PiThinkingLevel): PiThinkingLevel {
    const nextLevel = clampPiThinkingLevel(requestedLevel, asPiThinkingLevels(session.getAvailableThinkingLevels()))
    if (session.thinkingLevel !== nextLevel) {
        session.agent.state.thinkingLevel = nextLevel
        session.sessionManager.appendThinkingLevelChange(nextLevel)
    }
    return nextLevel
}

export function applyModel(session: PiSdkSession, model: PiSdkModel): void {
    const currentModel = session.model
    if (currentModel?.provider === model.provider && currentModel.id === model.id) {
        return
    }
    const currentThinkingLevel = session.thinkingLevel
    session.agent.state.model = model
    session.sessionManager.appendModelChange(model.provider, model.id)
    applyThinkingLevel(session, currentThinkingLevel as PiThinkingLevel)
}
