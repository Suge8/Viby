import { useCallback, useEffect, useState } from 'react'
import {
    applyPendingRuntimeUpdate,
    readPendingRuntimeUpdate,
    RUNTIME_UPDATE_READY_EVENT,
    type RuntimeUpdateSnapshot
} from '@/lib/runtimeUpdateChannel'

type RuntimeUpdateState = {
    snapshot: RuntimeUpdateSnapshot | null
    applyUpdate: () => Promise<boolean>
}

export function useRuntimeUpdateState(): RuntimeUpdateState {
    const [snapshot, setSnapshot] = useState<RuntimeUpdateSnapshot | null>(() => readPendingRuntimeUpdate())

    useEffect(() => {
        function syncPendingRuntimeUpdate(): void {
            setSnapshot(readPendingRuntimeUpdate())
        }

        syncPendingRuntimeUpdate()
        window.addEventListener(RUNTIME_UPDATE_READY_EVENT, syncPendingRuntimeUpdate)
        return () => {
            window.removeEventListener(RUNTIME_UPDATE_READY_EVENT, syncPendingRuntimeUpdate)
        }
    }, [])

    const applyUpdate = useCallback(async (): Promise<boolean> => {
        const applied = await applyPendingRuntimeUpdate()
        if (applied) {
            setSnapshot(null)
        }
        return applied
    }, [])

    return {
        snapshot,
        applyUpdate
    }
}
