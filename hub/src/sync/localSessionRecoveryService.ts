import { getSessionDriverRuntimeHandle, setSessionDriverRuntimeHandle } from '@viby/protocol'
import { MetadataSchema } from '@viby/protocol/schemas'
import type {
    LocalSessionCatalog,
    LocalSessionCatalogEntry,
    LocalSessionCatalogRequest,
    LocalSessionExportRequest,
    LocalSessionTranscriptMessage,
    Metadata,
    Session,
} from '@viby/protocol/types'
import type { Store } from '../store'
import type { StoredSession } from '../store/types'
import type { Machine } from './machineCache'
import type { SessionCache } from './sessionCache'
import type { SessionRpcFacade } from './sessionRpcFacade'

const LOCAL_SESSION_RECOVERY_TAG_PREFIX = 'local-recovery'

function buildLocalSessionRecoveryTag(
    machineId: string,
    session: Pick<LocalSessionCatalogEntry, 'driver' | 'providerSessionId'>
): string {
    return `${LOCAL_SESSION_RECOVERY_TAG_PREFIX}:${machineId}:${session.driver}:${session.providerSessionId}`
}

function parseStoredMetadata(session: Pick<StoredSession, 'metadata'>): Metadata | null {
    const parsed = MetadataSchema.safeParse(session.metadata)
    return parsed.success ? parsed.data : null
}

function matchesHubKnownLocalSession(
    session: Pick<StoredSession, 'metadata'>,
    machineId: string,
    localSession: Pick<LocalSessionCatalogEntry, 'driver' | 'providerSessionId'>
): boolean {
    const metadata = parseStoredMetadata(session)
    if (!metadata || metadata.machineId !== machineId) {
        return false
    }

    return getSessionDriverRuntimeHandle(metadata, localSession.driver)?.sessionId === localSession.providerSessionId
}

function buildImportedMessageContent(message: LocalSessionTranscriptMessage): unknown {
    if (message.role === 'user') {
        return {
            role: 'user',
            content: {
                type: 'text',
                text: message.text,
                attachments: [],
            },
        }
    }

    return {
        role: 'agent',
        content: {
            type: 'text',
            text: message.text,
        },
    }
}

function buildImportedMetadata(
    machine: Machine,
    request: LocalSessionExportRequest,
    title: string,
    summary: string | undefined,
    updatedAt: number
): Metadata {
    const baseMetadata: Metadata = {
        path: request.path,
        host: machine.metadata?.host ?? 'local-runtime',
        version: machine.metadata?.vibyCliVersion,
        os: machine.metadata?.platform,
        machineId: machine.id,
        name: title,
        summary: summary
            ? {
                  text: summary,
                  updatedAt,
              }
            : undefined,
        lifecycleState: 'closed',
        lifecycleStateSince: updatedAt,
    }

    return {
        ...baseMetadata,
        ...setSessionDriverRuntimeHandle(baseMetadata, request.driver, {
            sessionId: request.providerSessionId,
        }),
    }
}

export class LocalSessionRecoveryService {
    private readonly inFlightImports = new Map<string, Promise<Session>>()

    constructor(
        private readonly store: Store,
        private readonly sessionCache: SessionCache,
        private readonly sessionRpcFacade: SessionRpcFacade
    ) {}

    async listLocalSessions(machineId: string, request: LocalSessionCatalogRequest): Promise<LocalSessionCatalog> {
        const catalog = await this.sessionRpcFacade.listLocalSessions(machineId, request)
        const storedSessions = this.store.sessions.getSessions()
        const importedTags = new Set(
            storedSessions
                .map((session) => session.tag)
                .filter((tag): tag is string => typeof tag === 'string' && tag.length > 0)
        )

        return {
            capabilities: catalog.capabilities,
            sessions: catalog.sessions.filter((session) => {
                if (importedTags.has(buildLocalSessionRecoveryTag(machineId, session))) {
                    return false
                }

                return !storedSessions.some((storedSession) =>
                    matchesHubKnownLocalSession(storedSession, machineId, session)
                )
            }),
        }
    }

    async importLocalSession(
        machine: Machine,
        request: LocalSessionExportRequest
    ): Promise<{ session: Session; imported: boolean }> {
        const recoveryTag = buildLocalSessionRecoveryTag(machine.id, request)
        const existing = this.store.sessions.getSessions().find((session) => session.tag === recoveryTag) ?? null
        if (existing) {
            const session = this.sessionCache.getSession(existing.id) ?? this.sessionCache.refreshSession(existing.id)
            if (!session) {
                throw new Error('Recovered session snapshot unavailable')
            }

            return {
                session,
                imported: false,
            }
        }

        const inFlightImport = this.inFlightImports.get(recoveryTag)
        if (inFlightImport) {
            return {
                session: await inFlightImport,
                imported: true,
            }
        }

        const importPromise = this.importLocalSessionSnapshot(machine, request, recoveryTag)
        this.inFlightImports.set(recoveryTag, importPromise)

        try {
            const session = await importPromise
            return {
                session,
                imported: true,
            }
        } finally {
            if (this.inFlightImports.get(recoveryTag) === importPromise) {
                this.inFlightImports.delete(recoveryTag)
            }
        }
    }

    private async importLocalSessionSnapshot(
        machine: Machine,
        request: LocalSessionExportRequest,
        recoveryTag: string
    ): Promise<Session> {
        const snapshot = await this.sessionRpcFacade.exportLocalSession(machine.id, request)
        const metadata = buildImportedMetadata(machine, request, snapshot.title, snapshot.summary, snapshot.updatedAt)
        const stored = this.store.sessions.getOrCreateSession({
            tag: recoveryTag,
            metadata,
            createdAt: snapshot.startedAt,
            updatedAt: snapshot.updatedAt,
        })

        try {
            this.store.messages.addMessages(
                stored.id,
                snapshot.messages.map((message) => ({
                    content: buildImportedMessageContent(message),
                    createdAt: message.createdAt,
                }))
            )
            this.store.sessions.touchSessionUpdatedAt(stored.id, snapshot.updatedAt)

            const session = this.sessionCache.refreshSession(stored.id)
            if (!session) {
                throw new Error('Recovered session snapshot unavailable')
            }

            return session
        } catch (error) {
            this.store.sessions.deleteSession(stored.id)
            throw error
        }
    }
}
