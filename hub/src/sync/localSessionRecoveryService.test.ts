import { describe, expect, it, mock } from 'bun:test'
import { setSessionDriverRuntimeHandle } from '@viby/protocol'
import type { LocalSessionExportSnapshot, Metadata, Session } from '@viby/protocol/types'
import type { Store } from '../store'
import type { StoredSession } from '../store/types'
import { LocalSessionRecoveryService } from './localSessionRecoveryService'
import type { Machine } from './machineCache'
import type { SessionCache } from './sessionCache'
import type { SessionRpcFacade } from './sessionRpcFacade'

function createStoredSession(input: Partial<StoredSession> & Pick<StoredSession, 'id'>): StoredSession {
    return {
        id: input.id,
        tag: input.tag ?? null,
        machineId: input.machineId ?? null,
        createdAt: input.createdAt ?? 1,
        updatedAt: input.updatedAt ?? 1,
        metadata: input.metadata ?? null,
        metadataVersion: input.metadataVersion ?? 1,
        agentState: input.agentState ?? null,
        agentStateVersion: input.agentStateVersion ?? 0,
        model: input.model ?? null,
        modelReasoningEffort: input.modelReasoningEffort ?? null,
        permissionMode: input.permissionMode ?? null,
        collaborationMode: input.collaborationMode ?? null,
        todos: input.todos ?? null,
        todosUpdatedAt: input.todosUpdatedAt ?? null,
        latestActivityAt: input.latestActivityAt ?? null,
        latestActivityKind: input.latestActivityKind ?? null,
        latestCompletedReplyAt: input.latestCompletedReplyAt ?? null,
        active: input.active ?? false,
        activeAt: input.activeAt ?? null,
        seq: input.seq ?? 0,
    }
}

describe('LocalSessionRecoveryService', () => {
    it('filters out sessions that Hub already knows through recovery tags or runtime handles', async () => {
        const knownMetadata: Metadata = {
            path: '/repo',
            host: 'localhost',
            machineId: 'machine-1',
        }
        const storeSessions = [
            createStoredSession({
                id: 'imported-session',
                tag: 'local-recovery:machine-1:claude:claude-imported',
            }),
            createStoredSession({
                id: 'known-session',
                metadata: setSessionDriverRuntimeHandle(knownMetadata, 'claude', { sessionId: 'claude-known' }),
            }),
        ]
        const store = {
            sessions: {
                getSessions: () => storeSessions,
            },
        } as unknown as Store
        const sessionCache = {} as SessionCache
        const sessionRpcFacade = {
            listLocalSessions: mock(async () => ({
                capabilities: [{ driver: 'claude', supported: true }],
                sessions: [
                    {
                        driver: 'claude',
                        providerSessionId: 'claude-imported',
                        title: 'Imported already',
                        path: '/repo',
                        startedAt: 1,
                        updatedAt: 2,
                    },
                    {
                        driver: 'claude',
                        providerSessionId: 'claude-known',
                        title: 'Known already',
                        path: '/repo',
                        startedAt: 1,
                        updatedAt: 2,
                    },
                    {
                        driver: 'claude',
                        providerSessionId: 'claude-orphan',
                        title: 'Recover me',
                        path: '/repo',
                        startedAt: 1,
                        updatedAt: 2,
                    },
                ],
            })),
        } as unknown as SessionRpcFacade

        const service = new LocalSessionRecoveryService(store, sessionCache, sessionRpcFacade)

        await expect(service.listLocalSessions('machine-1', { path: '/repo', driver: 'claude' })).resolves.toEqual({
            capabilities: [{ driver: 'claude', supported: true }],
            sessions: [
                {
                    driver: 'claude',
                    providerSessionId: 'claude-orphan',
                    title: 'Recover me',
                    path: '/repo',
                    startedAt: 1,
                    updatedAt: 2,
                },
            ],
        })
    })

    it('deduplicates concurrent imports for the same recovery tag', async () => {
        const storedSessions: StoredSession[] = []
        const recoveredSession: Session = {
            id: 'session-recovered',
            seq: 1,
            createdAt: 10,
            updatedAt: 20,
            active: false,
            activeAt: 20,
            metadata: {
                path: '/repo',
                host: 'localhost',
                driver: 'claude',
                machineId: 'machine-1',
                lifecycleState: 'closed',
                lifecycleStateSince: 20,
            },
            metadataVersion: 1,
            agentState: null,
            agentStateVersion: 0,
            thinking: false,
            thinkingAt: 20,
            latestCompletedReplyAt: null,
            model: null,
            modelReasoningEffort: null,
            todos: undefined,
        }
        let resolveExport!: (snapshot: LocalSessionExportSnapshot) => void
        let hasResolveExport = false
        const store = {
            sessions: {
                getSessions: () => storedSessions,
                getOrCreateSession: mock(
                    (input: { tag: string; metadata: unknown; createdAt: number; updatedAt: number }) => {
                        const existing = storedSessions.find((session) => session.tag === input.tag)
                        if (existing) {
                            return existing
                        }

                        const stored = createStoredSession({
                            id: 'stored-session',
                            tag: input.tag,
                            metadata: input.metadata,
                            createdAt: input.createdAt,
                            updatedAt: input.updatedAt,
                        })
                        storedSessions.push(stored)
                        return stored
                    }
                ),
                touchSessionUpdatedAt: mock(() => true),
                deleteSession: mock((id: string) => {
                    const index = storedSessions.findIndex((session) => session.id === id)
                    if (index >= 0) {
                        storedSessions.splice(index, 1)
                    }
                    return true
                }),
            },
            messages: {
                addMessages: mock(() => []),
            },
        } as unknown as Store
        const sessionCache = {
            getSession: mock(() => null),
            refreshSession: mock(() => recoveredSession),
        } as unknown as SessionCache
        const sessionRpcFacade = {
            exportLocalSession: mock(
                () =>
                    new Promise<LocalSessionExportSnapshot>((resolve) => {
                        resolveExport = resolve
                        hasResolveExport = true
                    })
            ),
        } as unknown as SessionRpcFacade
        const service = new LocalSessionRecoveryService(store, sessionCache, sessionRpcFacade)
        const machine = { id: 'machine-1', metadata: {} } as Machine
        const request = {
            path: '/repo',
            driver: 'claude',
            providerSessionId: 'claude-session-1',
        } as const

        const firstImport = service.importLocalSession(machine, request)
        const secondImport = service.importLocalSession(machine, request)

        expect(sessionRpcFacade.exportLocalSession).toHaveBeenCalledTimes(1)

        if (!hasResolveExport) {
            throw new Error('Expected export promise resolver to be assigned')
        }

        resolveExport({
            path: '/repo',
            driver: 'claude',
            providerSessionId: 'claude-session-1',
            title: 'Recovered Claude Session',
            startedAt: 10,
            updatedAt: 20,
            messages: [{ role: 'user', text: 'hello', createdAt: 11 }],
        })

        await expect(firstImport).resolves.toMatchObject({ session: recoveredSession, imported: true })
        await expect(secondImport).resolves.toMatchObject({ session: recoveredSession, imported: true })
        expect(store.messages.addMessages).toHaveBeenCalledTimes(1)
    })
})
