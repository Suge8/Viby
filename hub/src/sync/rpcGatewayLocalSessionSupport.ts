import type { LocalSessionCatalog, LocalSessionExportSnapshot } from '@viby/protocol/types'

export function parseLocalSessionCatalogResponse(response: unknown): LocalSessionCatalog {
    if (
        !response ||
        typeof response !== 'object' ||
        !Array.isArray((response as LocalSessionCatalog).capabilities) ||
        !Array.isArray((response as LocalSessionCatalog).sessions)
    ) {
        throw new Error('Unexpected list-local-sessions result')
    }

    return response as LocalSessionCatalog
}

export function parseLocalSessionExportResponse(response: unknown): LocalSessionExportSnapshot {
    if (
        !response ||
        typeof response !== 'object' ||
        typeof (response as LocalSessionExportSnapshot).driver !== 'string' ||
        typeof (response as LocalSessionExportSnapshot).providerSessionId !== 'string' ||
        !Array.isArray((response as LocalSessionExportSnapshot).messages)
    ) {
        throw new Error('Unexpected export-local-session result')
    }

    return response as LocalSessionExportSnapshot
}
