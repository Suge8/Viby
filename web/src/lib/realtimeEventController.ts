import type { QueryClient } from '@tanstack/react-query'
import { resolveCommandCapabilityScopeKey } from '@viby/protocol'
import { applySessionStream, clearSessionStream, ingestIncomingMessages } from '@/lib/message-window-store'
import { queryKeys } from '@/lib/query-keys'
import {
    getSessionPatch,
    hasUnknownSessionPatchKeys,
    isArchivedKeepalivePatch,
    isSessionRecord,
    type SessionPatch,
} from '@/lib/realtimeEventGuards'
import { createRealtimeInvalidationBatch } from '@/lib/realtimeInvalidationBatch'
import { patchSessionSummaryCache, patchSessionSummaryFromMessageCache } from '@/lib/realtimeSessionSummaryCache'
import { reportWebRuntimeError } from '@/lib/runtimeDiagnostics'
import { removeSessionClientState, writeSessionToQueryCache } from '@/lib/sessionQueryCache'
import type { Session, SessionResponse, SessionsResponse, SyncEvent } from '@/types/api'
export type ToastEvent = Extract<SyncEvent, { type: 'toast' }>
type RealtimeEventControllerOptions = {
    queryClient: QueryClient
    onEvent: (event: SyncEvent) => void
    onToast?: (event: ToastEvent) => void
}
export function createRealtimeEventController(options: RealtimeEventControllerOptions): {
    handleEvent: (event: SyncEvent) => void
    dispose: () => void
} {
    const invalidationBatch = createRealtimeInvalidationBatch({
        queryClient: options.queryClient,
        onError: (error) => {
            reportWebRuntimeError('Failed to flush realtime query invalidations.', error)
        },
    })

    function patchSessionSummary(sessionId: string, patch: SessionPatch): boolean {
        let patched = false

        options.queryClient.setQueryData<SessionsResponse | undefined>(queryKeys.sessions, (previous) => {
            const result = patchSessionSummaryCache(previous, sessionId, patch)
            patched = result.patched
            return result.next
        })

        return patched
    }

    function patchSessionSummaryFromMessage(
        sessionId: string,
        message: Extract<SyncEvent, { type: 'message-received' }>['message']
    ): boolean {
        let patched = false

        options.queryClient.setQueryData<SessionsResponse | undefined>(queryKeys.sessions, (previous) => {
            const result = patchSessionSummaryFromMessageCache(previous, sessionId, message)
            patched = result.patched
            return result.next
        })

        return patched
    }

    function patchSessionDetail(sessionId: string, patch: SessionPatch): boolean {
        let patched = false
        let commandCapabilityScopeChanged = false

        options.queryClient.setQueryData<SessionResponse | undefined>(queryKeys.session(sessionId), (previous) => {
            if (!previous?.session) {
                return previous
            }
            if (isArchivedKeepalivePatch(previous.session.metadata?.lifecycleState, patch)) {
                patched = true
                return previous
            }

            patched = true
            const nextMetadata = hasLifecycleMetadataHint(patch)
                ? {
                      ...(previous.session.metadata ?? { path: '', host: '' }),
                      lifecycleState: patch.lifecycleStateHint ?? previous.session.metadata?.lifecycleState,
                      lifecycleStateSince:
                          patch.lifecycleStateSinceHint ?? previous.session.metadata?.lifecycleStateSince,
                  }
                : previous.session.metadata
            commandCapabilityScopeChanged =
                resolveCommandCapabilityScopeKey(previous.session.metadata) !==
                resolveCommandCapabilityScopeKey(nextMetadata)
            return {
                ...previous,
                session: {
                    ...previous.session,
                    active: patch.active ?? previous.session.active,
                    thinking: patch.thinking ?? previous.session.thinking,
                    activeAt: patch.activeAt ?? previous.session.activeAt,
                    updatedAt: patch.updatedAt ?? previous.session.updatedAt,
                    model: Object.prototype.hasOwnProperty.call(patch, 'model')
                        ? (patch.model ?? null)
                        : previous.session.model,
                    modelReasoningEffort: Object.prototype.hasOwnProperty.call(patch, 'modelReasoningEffort')
                        ? (patch.modelReasoningEffort ?? null)
                        : previous.session.modelReasoningEffort,
                    permissionMode: patch.permissionMode ?? previous.session.permissionMode,
                    collaborationMode: patch.collaborationMode ?? previous.session.collaborationMode,
                    metadata: nextMetadata,
                },
            }
        })

        if (commandCapabilityScopeChanged) {
            invalidationBatch.queueCommandCapabilities(sessionId)
        }

        return patched
    }

    function handleEvent(event: SyncEvent): void {
        if (event.type === 'toast') {
            options.onToast?.(event)
            return
        }

        if (event.type === 'message-received') {
            ingestIncomingMessages(event.sessionId, [event.message])
            if (!patchSessionSummaryFromMessage(event.sessionId, event.message)) {
                invalidationBatch.queueSessions()
            }
        }

        if (event.type === 'session-stream-updated') {
            applySessionStream(event.sessionId, event.stream)
        }

        if (event.type === 'session-stream-cleared') {
            clearSessionStream(event.sessionId, event.assistantTurnId)
        }

        if (event.type === 'command-capabilities-invalidated') {
            invalidationBatch.queueCommandCapabilities(event.sessionId)
        }

        if (event.type === 'session-added' || event.type === 'session-updated' || event.type === 'session-removed') {
            if (event.type === 'session-removed') {
                removeSessionClientState(options.queryClient, event.sessionId)
            } else if (isSessionRecord(event.data) && event.data.id === event.sessionId) {
                writeSessionToQueryCache(options.queryClient, event.data)
            } else {
                const patch = getSessionPatch(event.data)
                if (patch) {
                    const detailPatched = patchSessionDetail(event.sessionId, patch)
                    const summaryPatched = patchSessionSummary(event.sessionId, patch)

                    if (!detailPatched) {
                        invalidationBatch.queueSession(event.sessionId)
                    }
                    if (!summaryPatched) {
                        invalidationBatch.queueSessions()
                    }
                    if (hasUnknownSessionPatchKeys(event.data)) {
                        invalidationBatch.queueSession(event.sessionId)
                        invalidationBatch.queueSessions()
                        invalidationBatch.queueCommandCapabilities(event.sessionId)
                    }
                } else {
                    invalidationBatch.queueSession(event.sessionId)
                    invalidationBatch.queueSessions()
                }
            }
        }

        if (event.type === 'machine-updated') {
            invalidationBatch.queueRuntime()
        }

        options.onEvent(event)
    }

    function dispose(): void {
        invalidationBatch.dispose()
    }

    return {
        handleEvent,
        dispose,
    }
}

function hasLifecycleMetadataHint(patch: SessionPatch): boolean {
    return patch.lifecycleStateHint !== undefined || patch.lifecycleStateSinceHint !== undefined
}
