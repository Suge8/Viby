import { hydrateMessageWindowWarmSnapshotsFromAppCache } from '@/lib/messageWindowWarmSnapshot'
import { hydrateSessionAttentionFromAppCache } from '@/lib/sessionAttentionStore'
import { hydrateSessionsWarmSnapshotFromAppCache } from '@/lib/sessionsWarmSnapshot'
import { hydrateSessionWarmSnapshotsFromAppCache } from '@/lib/sessionWarmSnapshot'

export async function preloadAppCacheRuntime(): Promise<void> {
    await Promise.all([
        hydrateMessageWindowWarmSnapshotsFromAppCache(),
        hydrateSessionAttentionFromAppCache(),
        hydrateSessionWarmSnapshotsFromAppCache(),
        hydrateSessionsWarmSnapshotFromAppCache(),
    ])
}
