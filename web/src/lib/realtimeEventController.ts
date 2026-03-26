import type { QueryClient } from '@tanstack/react-query'
import type {
    Machine,
    MachinesResponse,
    Session,
    SessionResponse,
    SessionsResponse,
    SyncEvent
} from '@/types/api'
import {
    applySessionStream,
    clearSessionStream,
    ingestIncomingMessages
} from '@/lib/message-window-store'
import {
    getSessionPatch,
    hasUnknownSessionPatchKeys,
    isArchivedKeepalivePatch,
    isInactiveMachinePatch,
    isMachineRecord,
    isMachineRefreshOnlyPayload,
    isSessionRecord,
    type SessionPatch,
} from '@/lib/realtimeEventGuards'
import { queryKeys } from '@/lib/query-keys'
import {
    patchSessionSummaryCache,
    patchSessionSummaryFromMessageCache,
} from '@/lib/realtimeSessionSummaryCache'
import { removeSessionClientState, writeSessionToQueryCache } from '@/lib/sessionQueryCache'
export type ToastEvent = Extract<SyncEvent, { type: 'toast' }>
const INVALIDATION_BATCH_MS = 16
type PendingInvalidations = { sessions: boolean; machines: boolean; sessionIds: Set<string> }
type RealtimeEventControllerOptions = {
    queryClient: QueryClient
    onEvent: (event: SyncEvent) => void
    onToast?: (event: ToastEvent) => void
}
export function createRealtimeEventController(options: RealtimeEventControllerOptions): {
    handleEvent: (event: SyncEvent) => void
    dispose: () => void
} {
    let invalidationTimer: ReturnType<typeof setTimeout> | null = null
    const pendingInvalidations: PendingInvalidations = {
        sessions: false,
        machines: false,
        sessionIds: new Set<string>()
    }

    function flushInvalidations(): void {
        if (!pendingInvalidations.sessions && !pendingInvalidations.machines && pendingInvalidations.sessionIds.size === 0) {
            return
        }

        const shouldInvalidateSessions = pendingInvalidations.sessions
        const shouldInvalidateMachines = pendingInvalidations.machines
        const sessionIds = Array.from(pendingInvalidations.sessionIds)

        pendingInvalidations.sessions = false
        pendingInvalidations.machines = false
        pendingInvalidations.sessionIds.clear()

        const tasks: Array<Promise<unknown>> = []
        if (shouldInvalidateSessions) {
            tasks.push(options.queryClient.invalidateQueries({ queryKey: queryKeys.sessions }))
        }
        for (const sessionId of sessionIds) {
            tasks.push(options.queryClient.invalidateQueries({ queryKey: queryKeys.session(sessionId) }))
        }
        if (shouldInvalidateMachines) {
            tasks.push(options.queryClient.invalidateQueries({ queryKey: queryKeys.machines }))
        }

        if (tasks.length > 0) {
            void Promise.all(tasks).catch(() => {})
        }
    }

    function scheduleInvalidationFlush(): void {
        if (invalidationTimer) {
            return
        }
        invalidationTimer = setTimeout(() => {
            invalidationTimer = null
            flushInvalidations()
        }, INVALIDATION_BATCH_MS)
    }

    function queueSessionListInvalidation(): void {
        pendingInvalidations.sessions = true
        scheduleInvalidationFlush()
    }

    function queueSessionDetailInvalidation(sessionId: string): void {
        pendingInvalidations.sessionIds.add(sessionId)
        scheduleInvalidationFlush()
    }

    function queueMachinesInvalidation(): void {
        pendingInvalidations.machines = true
        scheduleInvalidationFlush()
    }

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

        options.queryClient.setQueryData<SessionResponse | undefined>(queryKeys.session(sessionId), (previous) => {
            if (!previous?.session) {
                return previous
            }
            if (isArchivedKeepalivePatch(previous.session.metadata?.lifecycleState, patch)) {
                patched = true
                return previous
            }

            patched = true
            return {
                ...previous,
                session: {
                    ...previous.session,
                    active: patch.active ?? previous.session.active,
                    thinking: patch.thinking ?? previous.session.thinking,
                    activeAt: patch.activeAt ?? previous.session.activeAt,
                    updatedAt: patch.updatedAt ?? previous.session.updatedAt,
                    model: Object.prototype.hasOwnProperty.call(patch, 'model')
                        ? patch.model ?? null
                        : previous.session.model,
                    modelReasoningEffort: Object.prototype.hasOwnProperty.call(patch, 'modelReasoningEffort')
                        ? patch.modelReasoningEffort ?? null
                        : previous.session.modelReasoningEffort,
                    permissionMode: patch.permissionMode ?? previous.session.permissionMode,
                    collaborationMode: patch.collaborationMode ?? previous.session.collaborationMode,
                    metadata: hasLifecycleMetadataHint(patch)
                        ? {
                            ...(previous.session.metadata ?? { path: '', host: '' }),
                            lifecycleState: patch.lifecycleStateHint ?? previous.session.metadata?.lifecycleState,
                            lifecycleStateSince: patch.lifecycleStateSinceHint ?? previous.session.metadata?.lifecycleStateSince
                        }
                        : previous.session.metadata
                }
            }
        })

        return patched
    }

    function upsertMachine(machine: Machine): void {
        options.queryClient.setQueryData<MachinesResponse | undefined>(queryKeys.machines, (previous) => {
            if (!previous) {
                return previous
            }

            const nextMachines = previous.machines.slice()
            const index = nextMachines.findIndex((item) => item.id === machine.id)
            if (!machine.active) {
                if (index >= 0) {
                    nextMachines.splice(index, 1)
                    return { ...previous, machines: nextMachines }
                }
                return previous
            }

            if (index >= 0) {
                nextMachines[index] = machine
            } else {
                nextMachines.push(machine)
            }

            return { ...previous, machines: nextMachines }
        })
    }

    function removeMachine(machineId: string): void {
        options.queryClient.setQueryData<MachinesResponse | undefined>(queryKeys.machines, (previous) => {
            if (!previous) {
                return previous
            }

            const nextMachines = previous.machines.filter((item) => item.id !== machineId)
            if (nextMachines.length === previous.machines.length) {
                return previous
            }

            return { ...previous, machines: nextMachines }
        })
    }

    function handleEvent(event: SyncEvent): void {
        if (event.type === 'toast') {
            options.onToast?.(event)
            return
        }

        if (event.type === 'message-received') {
            ingestIncomingMessages(event.sessionId, [event.message])
            if (!patchSessionSummaryFromMessage(event.sessionId, event.message)) {
                queueSessionListInvalidation()
            }
        }

        if (event.type === 'session-stream-updated') {
            applySessionStream(event.sessionId, event.stream)
        }

        if (event.type === 'session-stream-cleared') {
            clearSessionStream(event.sessionId, event.streamId)
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
                        queueSessionDetailInvalidation(event.sessionId)
                    }
                    if (!summaryPatched) {
                        queueSessionListInvalidation()
                    }
                    if (hasUnknownSessionPatchKeys(event.data)) {
                        queueSessionDetailInvalidation(event.sessionId)
                        queueSessionListInvalidation()
                    }
                } else {
                    queueSessionDetailInvalidation(event.sessionId)
                    queueSessionListInvalidation()
                }
            }
        }

        if (event.type === 'machine-updated') {
            if (isMachineRecord(event.data)) {
                upsertMachine(event.data)
            } else if (event.data === null || isInactiveMachinePatch(event.data)) {
                removeMachine(event.machineId)
            } else if (isMachineRefreshOnlyPayload(event.data)) {
                queueMachinesInvalidation()
            }
        }

        options.onEvent(event)
    }

    function dispose(): void {
        if (invalidationTimer) {
            clearTimeout(invalidationTimer)
            invalidationTimer = null
        }
        pendingInvalidations.sessions = false
        pendingInvalidations.machines = false
        pendingInvalidations.sessionIds.clear()
    }

    return {
        handleEvent,
        dispose
    }
}

function hasLifecycleMetadataHint(patch: SessionPatch): boolean {
    return patch.lifecycleStateHint !== undefined || patch.lifecycleStateSinceHint !== undefined
}
