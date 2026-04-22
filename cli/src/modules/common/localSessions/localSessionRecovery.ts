import type {
    LocalSessionCapability,
    LocalSessionCatalog,
    LocalSessionCatalogEntry,
    LocalSessionCatalogRequest,
    LocalSessionExportRequest,
    LocalSessionExportSnapshot,
    SessionDriver,
} from '@viby/protocol/types'
import { logger } from '@/ui/logger'
import { exportClaudeLocalSession, listClaudeLocalSessions } from './localSessionRecoveryClaude'
import { exportCodexLocalSession, listCodexLocalSessions } from './localSessionRecoveryCodex'
import { exportCopilotLocalSession, listCopilotLocalSessions } from './localSessionRecoveryCopilot'
import { exportGeminiLocalSession, listGeminiLocalSessions } from './localSessionRecoveryGemini'
import { exportOpencodeLocalSession, listOpencodeLocalSessions } from './localSessionRecoveryOpencode'
import { normalizeLocalSessionPath } from './localSessionRecoverySupport'

type SupportedLocalSessionDriver = 'claude' | 'codex' | 'copilot' | 'gemini' | 'opencode'

type LocalSessionProvider = {
    listCatalog: (path: string) => Promise<LocalSessionCatalogEntry[]>
    export: (path: string, providerSessionId: string) => Promise<LocalSessionExportSnapshot>
}

type TimedCacheEntry<T> = {
    expiresAt: number
    promise: Promise<T>
}

const LOCAL_SESSION_CATALOG_TTL_MS = 5_000
const LOCAL_SESSION_EXPORT_TTL_MS = 15_000
const catalogCache = new Map<string, TimedCacheEntry<LocalSessionCatalog>>()
const exportCache = new Map<string, TimedCacheEntry<LocalSessionExportSnapshot>>()

const PROVIDERS: Record<SupportedLocalSessionDriver, LocalSessionProvider> = {
    claude: {
        listCatalog: listClaudeLocalSessions,
        export: exportClaudeLocalSession,
    },
    codex: {
        listCatalog: listCodexLocalSessions,
        export: exportCodexLocalSession,
    },
    copilot: {
        listCatalog: listCopilotLocalSessions,
        export: exportCopilotLocalSession,
    },
    gemini: {
        listCatalog: listGeminiLocalSessions,
        export: exportGeminiLocalSession,
    },
    opencode: {
        listCatalog: listOpencodeLocalSessions,
        export: exportOpencodeLocalSession,
    },
}

const UNSUPPORTED_DRIVER_REASONS: Partial<Record<SessionDriver, string>> = {
    cursor: 'Cursor does not expose a reliable local session catalog/export path yet.',
    pi: 'Pi does not expose provider-local orphan sessions for durable recovery.',
}

function formatDiagnosticFields(fields: Record<string, unknown>): string {
    return Object.entries(fields)
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join(' ')
}

function formatDiagnosticError(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}

async function withLocalSessionDiagnostics<T>(
    operation: string,
    fields: Record<string, unknown>,
    run: () => Promise<T>,
    summarize: (result: T) => Record<string, unknown>
): Promise<T> {
    const startedAt = Date.now()

    try {
        const result = await run()
        logger.debug(
            `[local-recovery] ${operation} ${formatDiagnosticFields({
                ...fields,
                ...summarize(result),
                durationMs: Date.now() - startedAt,
            })}`
        )
        return result
    } catch (error) {
        logger.debug(
            `[local-recovery] ${operation} ${formatDiagnosticFields({
                ...fields,
                durationMs: Date.now() - startedAt,
                error: formatDiagnosticError(error),
            })}`
        )
        throw error
    }
}

function sortCatalogSessions(left: LocalSessionCatalogEntry, right: LocalSessionCatalogEntry): number {
    if (right.updatedAt !== left.updatedAt) {
        return right.updatedAt - left.updatedAt
    }
    if (right.startedAt !== left.startedAt) {
        return right.startedAt - left.startedAt
    }
    return left.title.localeCompare(right.title)
}

function getLocalSessionProvider(driver: SessionDriver): LocalSessionProvider | null {
    return driver in PROVIDERS ? PROVIDERS[driver as SupportedLocalSessionDriver] : null
}

async function loadDriverCatalog(
    driver: SessionDriver,
    path: string
): Promise<{ capabilities: LocalSessionCapability[]; sessions: LocalSessionCatalogEntry[] }> {
    const provider = getLocalSessionProvider(driver)
    if (!provider) {
        return {
            capabilities: [
                {
                    driver,
                    supported: false,
                    reason: UNSUPPORTED_DRIVER_REASONS[driver],
                } satisfies LocalSessionCapability,
            ],
            sessions: [],
        }
    }

    try {
        const sessions = await withLocalSessionDiagnostics(
            'catalog-driver',
            {
                driver,
                path,
            },
            async () => await provider.listCatalog(path),
            (result) => ({
                sessions: result.length,
            })
        )

        return {
            capabilities: [
                {
                    driver,
                    supported: true,
                } satisfies LocalSessionCapability,
            ],
            sessions: sessions.sort(sortCatalogSessions),
        }
    } catch (error) {
        return {
            capabilities: [
                {
                    driver,
                    supported: false,
                    reason: error instanceof Error ? error.message : 'Failed to scan local sessions',
                } satisfies LocalSessionCapability,
            ],
            sessions: [],
        }
    }
}

function getTimedCacheValue<T>(
    store: Map<string, TimedCacheEntry<T>>,
    key: string,
    ttlMs: number,
    load: () => Promise<T>
): Promise<T> {
    const now = Date.now()
    const cached = store.get(key)
    if (cached && cached.expiresAt > now) {
        return cached.promise
    }

    const promise = load().catch((error) => {
        if (store.get(key)?.promise === promise) {
            store.delete(key)
        }
        throw error
    })
    store.set(key, {
        expiresAt: now + ttlMs,
        promise,
    })
    return promise
}

export async function listLocalSessions(request: LocalSessionCatalogRequest): Promise<LocalSessionCatalog> {
    const normalizedPath = normalizeLocalSessionPath(request.path)
    const cacheKey = `${normalizedPath}:${request.driver}`
    const cacheHit = (() => {
        const cached = catalogCache.get(cacheKey)
        return cached ? cached.expiresAt > Date.now() : false
    })()

    return await withLocalSessionDiagnostics(
        'catalog',
        {
            driver: request.driver,
            path: request.path,
            cacheHit,
        },
        async () =>
            await getTimedCacheValue(catalogCache, cacheKey, LOCAL_SESSION_CATALOG_TTL_MS, async () => {
                return await loadDriverCatalog(request.driver, request.path)
            }),
        (result) => ({
            supportedDrivers: result.capabilities.filter((capability) => capability.supported).length,
            sessions: result.sessions.length,
        })
    )
}

export async function exportLocalSession(request: LocalSessionExportRequest): Promise<LocalSessionExportSnapshot> {
    const provider = getLocalSessionProvider(request.driver)
    if (!provider) {
        throw new Error(
            UNSUPPORTED_DRIVER_REASONS[request.driver] ?? `Local recovery is unsupported for ${request.driver}`
        )
    }

    const cacheKey = `${normalizeLocalSessionPath(request.path)}:${request.driver}:${request.providerSessionId}`
    const cacheHit = (() => {
        const cached = exportCache.get(cacheKey)
        return cached ? cached.expiresAt > Date.now() : false
    })()
    return await withLocalSessionDiagnostics(
        'export',
        {
            driver: request.driver,
            path: request.path,
            providerSessionId: request.providerSessionId,
            cacheHit,
        },
        async () =>
            await getTimedCacheValue(exportCache, cacheKey, LOCAL_SESSION_EXPORT_TTL_MS, async () => {
                return await provider.export(request.path, request.providerSessionId)
            }),
        (result) => ({
            messages: result.messages.length,
        })
    )
}
