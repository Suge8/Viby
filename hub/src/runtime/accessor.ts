import type { SyncEngine } from '../sync/syncEngine'
import type { HubRuntimeCore } from './core'

export type HubRuntimeAccessor = {
    getRuntime(): HubRuntimeCore | null
    getSyncEngine(): SyncEngine | null
    replaceRuntime(runtime: HubRuntimeCore): void
    disposeRuntime(): void
}

export function createHubRuntimeAccessor(): HubRuntimeAccessor {
    let currentRuntime: HubRuntimeCore | null = null

    function getRuntime(): HubRuntimeCore | null {
        return currentRuntime
    }

    function getSyncEngine(): SyncEngine | null {
        return currentRuntime?.syncEngine ?? null
    }

    function replaceRuntime(runtime: HubRuntimeCore): void {
        const previousRuntime = currentRuntime
        currentRuntime = runtime
        previousRuntime?.dispose()
    }

    function disposeRuntime(): void {
        const previousRuntime = currentRuntime
        currentRuntime = null
        previousRuntime?.dispose()
    }

    return {
        getRuntime,
        getSyncEngine,
        replaceRuntime,
        disposeRuntime
    }
}
