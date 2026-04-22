export const WARM_SNAPSHOT_MAX_AGE_MS = 30 * 60 * 1_000
export const WARM_SNAPSHOT_WRITE_DEBOUNCE_MS = 160

export function isWarmSnapshotFresh(at: number, now: number = Date.now()): boolean {
    return now - at <= WARM_SNAPSHOT_MAX_AGE_MS
}
