import type { LocalSessionCatalogEntry } from '@/types/api'

export function buildRecoverSelectionKey(session: LocalSessionCatalogEntry): string {
    return `${session.driver}:${session.providerSessionId}`
}
