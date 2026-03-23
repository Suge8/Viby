import { appendRealtimeTrace } from '@/lib/realtimeTrace'

export const RUNTIME_UPDATE_READY_EVENT = 'viby:runtime-update-ready'

export type RuntimeUpdateSnapshot = {
    availableAt: number
}

type RuntimeUpdateAction = () => Promise<void>

let pendingRuntimeUpdate: RuntimeUpdateSnapshot | null = null
let pendingRuntimeUpdateAction: RuntimeUpdateAction | null = null
let pendingRuntimeUpdateApply: Promise<boolean> | null = null

function clearPendingRuntimeUpdate(): void {
    pendingRuntimeUpdate = null
    pendingRuntimeUpdateAction = null
    pendingRuntimeUpdateApply = null
}

function dispatchRuntimeUpdateReady(snapshot: RuntimeUpdateSnapshot): void {
    if (typeof window === 'undefined') {
        return
    }

    window.dispatchEvent(new CustomEvent<RuntimeUpdateSnapshot>(RUNTIME_UPDATE_READY_EVENT, {
        detail: snapshot
    }))
}

export function publishRuntimeUpdateReady(action: RuntimeUpdateAction): RuntimeUpdateSnapshot | null {
    if (pendingRuntimeUpdateAction) {
        return pendingRuntimeUpdate
    }

    const snapshot: RuntimeUpdateSnapshot = {
        availableAt: Date.now()
    }

    pendingRuntimeUpdate = snapshot
    pendingRuntimeUpdateAction = action
    appendRealtimeTrace({
        at: snapshot.availableAt,
        type: 'update_available'
    })
    dispatchRuntimeUpdateReady(snapshot)
    return snapshot
}

export function readPendingRuntimeUpdate(): RuntimeUpdateSnapshot | null {
    return pendingRuntimeUpdate
}

export async function applyPendingRuntimeUpdate(): Promise<boolean> {
    if (pendingRuntimeUpdateApply) {
        return pendingRuntimeUpdateApply
    }

    const action = pendingRuntimeUpdateAction
    const snapshot = pendingRuntimeUpdate
    if (!action || !snapshot) {
        return false
    }

    pendingRuntimeUpdateApply = (async () => {
        appendRealtimeTrace({
            at: Date.now(),
            type: 'update_apply',
            details: {
                availableAt: snapshot.availableAt
            }
        })

        try {
            await action()
            clearPendingRuntimeUpdate()
            return true
        } catch (error) {
            appendRealtimeTrace({
                at: Date.now(),
                type: 'update_apply_error',
                details: {
                    availableAt: snapshot.availableAt,
                    message: error instanceof Error ? error.message : 'unknown'
                }
            })
            throw error
        } finally {
            pendingRuntimeUpdateApply = null
        }
    })()

    return pendingRuntimeUpdateApply
}

export function resetPendingRuntimeUpdate(): void {
    clearPendingRuntimeUpdate()
}
