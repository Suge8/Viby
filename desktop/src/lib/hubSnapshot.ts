import type { HubRuntimePhase, HubSnapshot } from '@/types'

export interface HubViewState {
    managed: boolean
    running: boolean
    ready: boolean
    booting: boolean
    displayedPhase?: HubRuntimePhase
}

export function deriveHubViewState(snapshot: HubSnapshot | null): HubViewState {
    const managed = snapshot?.managed ?? false
    const running = managed && (snapshot?.running ?? false)
    const phase = snapshot?.status?.phase
    const ready = running && phase === 'ready'
    const booting = managed && running && phase === 'starting'

    return {
        managed,
        running,
        ready,
        booting,
        displayedPhase: running || phase === 'error' || phase === 'stopped'
            ? (booting ? 'starting' : phase)
            : undefined
    }
}
