import { createWarmSnapshot, type InternalState } from '@/lib/messageWindowState'
import { writeMessageWindowWarmSnapshot } from '@/lib/messageWindowWarmSnapshot'
import { registerWarmSnapshotLifecycleFlush } from '@/lib/warmSnapshotLifecycle'

function shouldPersistCurrentWarmSnapshot(state: InternalState): boolean {
    return state.hasLoadedLatest || state.messages.length > 0 || state.pending.length > 0
}

export function createMessageWindowSnapshotRuntime(states: Map<string, InternalState>) {
    const flushActiveSnapshots = (): void => {
        for (const sessionId of states.keys()) {
            flushSessionSnapshot(sessionId)
        }
    }

    const registerLifecycle = (): void => {
        registerWarmSnapshotLifecycleFlush(flushActiveSnapshots)
    }

    const flushSessionSnapshot = (sessionId: string): boolean => {
        const current = states.get(sessionId)
        if (!current || !shouldPersistCurrentWarmSnapshot(current)) {
            return false
        }

        writeMessageWindowWarmSnapshot(createWarmSnapshot(current))
        return true
    }

    return {
        flushSessionSnapshot,
        registerLifecycle,
    }
}
