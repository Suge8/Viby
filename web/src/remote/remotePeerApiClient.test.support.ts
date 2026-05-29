import { QueryClient } from '@tanstack/react-query'
import { vi } from 'vitest'
import type { Session, SessionViewSnapshot } from '@/types/api'
import type { RemotePeerBridge } from './remotePairingBridgeTypes'
import { createRemotePeerApiClient } from './remotePeerApiClient'

type ApiHarness = {
    api: ReturnType<typeof createRemotePeerApiClient>
    bridge: RemotePeerBridge
    queryClient: QueryClient
}

const agentConfigVersion = {
    status: 'supported' as const,
    supportedVersion: '0.130.0',
    source: 'test',
    installedVersion: '0.130.0',
    checkedAt: 1,
}

export function createSession(overrides: Partial<Session> = {}): Session {
    const { codexServiceTier = null, ...restOverrides } = overrides

    return {
        id: 'session-1',
        seq: 1,
        createdAt: 1,
        updatedAt: 10,
        active: true,
        activeAt: 10,
        metadata: { path: '/repo', host: 'desk', name: 'Remote session', driver: 'codex' },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 1,
        thinking: false,
        thinkingAt: 0,
        model: 'gpt-test',
        modelReasoningEffort: null,
        codexServiceTier,
        latestActivityAt: 10,
        latestActivityKind: null,
        latestCompletedReplyAt: null,
        ...restOverrides,
    }
}

export function createSessionView(session: Session = createSession()): SessionViewSnapshot {
    return {
        session: { ...session, resumeAvailable: true },
        latestWindow: {
            messages: [
                {
                    id: 'message-1',
                    seq: 1,
                    localId: null,
                    content: [{ type: 'text', text: 'hello' }],
                    createdAt: 11,
                },
            ],
            page: { limit: 50, beforeSeq: null, nextBeforeSeq: null, hasMore: false },
        },
        stream: null,
        watermark: { latestSeq: 1, updatedAt: 11 },
        interactivity: {
            lifecycleState: 'running',
            resumeAvailable: true,
            allowSendWhenInactive: true,
            retryAvailable: false,
        },
    }
}

export function createBridge(overrides: Partial<RemotePeerBridge> = {}): RemotePeerBridge {
    const view = createSessionView()
    const bridge: RemotePeerBridge = {
        listSessions: vi.fn(async () => ({
            sessions: [
                {
                    id: 'session-1',
                    active: true,
                    thinking: false,
                    updatedAt: 10,
                    latestActivityAt: 10,
                    lifecycleState: 'running' as const,
                    resumeAvailable: true,
                    model: 'gpt-test',
                    codexServiceTier: null,
                    metadata: {
                        name: 'Remote session',
                        path: '/repo',
                        driver: 'codex' as const,
                        summary: { text: 'summary', updatedAt: 10 },
                    },
                },
            ],
        })),
        openSession: vi.fn(async () => ({
            session: view.session,
            stream: view.stream,
            watermark: view.watermark,
            interactivity: view.interactivity,
        })),
        resumeSession: vi.fn(async () => {
            const resumed = createSessionView(createSession({ updatedAt: 20 }))
            return {
                session: resumed.session,
                stream: resumed.stream,
                watermark: resumed.watermark,
                interactivity: resumed.interactivity,
            }
        }),
        getMessages: vi.fn(async () => view.latestWindow),
        loadAfter: vi.fn(async () => ({
            messages: [
                { id: 'message-2', seq: 2, localId: null, content: [{ type: 'text', text: 'after' }], createdAt: 12 },
            ],
            nextAfterSeq: 2,
        })),
        sendMessage: vi.fn(async () => ({ session: createSession({ updatedAt: 30, thinking: true }) })),
        abortSession: vi.fn(async () => ({ session: createSession({ thinking: false }) })),
        archiveSession: vi.fn(async () => ({ session: createSession({ active: false }) })),
        closeSession: vi.fn(async () => ({ session: createSession({ active: false }) })),
        unarchiveSession: vi.fn(async () => ({ session: createSession({ active: false }) })),
        renameSession: vi.fn(async () => ({
            session: createSession({ metadata: { path: '/repo', host: 'desk', name: 'Renamed', driver: 'codex' } }),
        })),
        deleteSession: vi.fn(async () => undefined),
        switchSessionDriver: vi.fn(async () => ({
            session: createSession({ metadata: { path: '/repo', host: 'desk', driver: 'claude' } }),
        })),
        setPermissionMode: vi.fn(async () => ({ session: createSession() })),
        setCollaborationMode: vi.fn(async () => ({ session: createSession({ collaborationMode: 'plan' }) })),
        setModel: vi.fn(async () => ({ session: createSession({ model: 'gpt-next' }) })),
        setModelReasoningEffort: vi.fn(async () => ({ session: createSession({ modelReasoningEffort: 'high' }) })),
        setCodexServiceTier: vi.fn(async () => ({ session: createSession({ codexServiceTier: 'fast' }) })),
        getCommandCapabilities: vi.fn(async () => ({ success: true, revision: 'remote', capabilities: [] })),
        approvePermission: vi.fn(async () => undefined),
        denyPermission: vi.fn(async () => undefined),
        getRuntimeCapabilities: vi.fn(async () => ({
            snapshot: {
                machineId: 'remote-machine',
                directory: null,
                detectedAt: null,
                expiresAt: null,
                refreshing: false,
                error: null,
                agents: [],
            },
        })),
        getRuntimeAgentAvailability: vi.fn(async () => ({ agents: [] })),
        getAgentConfig: vi.fn(async () => ({
            agents: [
                {
                    driver: 'codex' as const,
                    path: '/home/user/.codex/config.toml',
                    exists: true,
                    values: {},
                    version: agentConfigVersion,
                },
            ],
        })),
        saveAgentConfig: vi.fn(async () => ({
            agent: {
                driver: 'codex' as const,
                path: '/home/user/.codex/config.toml',
                exists: true,
                values: { 'codex.model': 'gpt-5.4' },
                version: agentConfigVersion,
            },
        })),
        restoreAgentConfig: vi.fn(async () => ({
            agent: {
                driver: 'codex' as const,
                path: '/home/user/.codex/config.toml',
                exists: true,
                values: { 'codex.model': 'gpt-5.2' },
                version: agentConfigVersion,
            },
        })),
        openAgentConfig: vi.fn(async () => ({ ok: true as const, path: '/home/user/.codex/config.toml' })),
        checkRuntimePathsExists: vi.fn(async () => ({ exists: { '/repo': true } })),
        browseRuntimeDirectory: vi.fn(async () => ({
            success: true,
            currentPath: '/repo',
            parentPath: null,
            entries: [{ name: 'app', path: '/repo/app', type: 'directory' as const }],
            roots: [],
        })),
        resolveAgentLaunchConfig: vi.fn(async () => ({
            type: 'error' as const,
            code: 'config_missing' as const,
            message: 'not configured',
        })),
        listRuntimeLocalSessions: vi.fn(async () => ({ capabilities: [], sessions: [] })),
        importRuntimeLocalSession: vi.fn(async () => ({
            session: createSession({ id: 'session-imported' }),
            imported: true,
        })),
        spawnSession: vi.fn(async () => ({ type: 'success' as const, session: createSession({ id: 'session-2' }) })),
        getGitStatus: vi.fn(async () => ({ success: true, stdout: ' M file.ts' })),
        getGitDiffNumstat: vi.fn(async () => ({ success: true, stdout: '1\t0\tfile.ts' })),
        getGitDiffFile: vi.fn(async () => ({ success: true, stdout: 'diff' })),
        searchSessionFiles: vi.fn(async () => ({
            success: true,
            files: [{ fileName: 'file.ts', filePath: '', fullPath: 'file.ts', fileType: 'file' as const }],
        })),
        readSessionFile: vi.fn(async () => ({ success: true, content: 'hello' })),
        listSessionDirectory: vi.fn(async () => ({
            success: true,
            entries: [{ name: 'file.ts', type: 'file' as const }],
        })),
        uploadFile: vi.fn(async () => ({ success: true, path: '/tmp/uploaded.png' })),
        deleteUploadFile: vi.fn(async () => ({ success: true })),
        getPushVapidPublicKey: vi.fn(async () => ({ publicKey: 'vapid-public-key' })),
        subscribePushNotifications: vi.fn(async () => undefined),
        unsubscribePushNotifications: vi.fn(async () => undefined),
        openTerminal: vi.fn(async () => undefined),
        writeTerminal: vi.fn(async () => undefined),
        resizeTerminal: vi.fn(async () => undefined),
        closeTerminal: vi.fn(async () => undefined),
        subscribeTerminal: vi.fn(() => () => {}),
        getTransportStats: vi.fn(async () => ({
            transport: 'direct' as const,
            transportMode: 'direct-webrtc' as const,
            localCandidateType: 'host',
            remoteCandidateType: 'srflx',
            currentRoundTripTimeMs: 12,
            previousTransport: null,
            sampledAt: 123,
            staleAfterMs: 15_000,
            routeRevision: 0,
            directBlockedReason: null,
        })),
        subscribe: vi.fn(() => () => {}),
        onClose: vi.fn(() => () => {}),
        close: vi.fn(),
    }
    return Object.assign(bridge, overrides)
}

export function createApiHarness(bridge = createBridge()): ApiHarness {
    const queryClient = new QueryClient()
    return { api: createRemotePeerApiClient({ bridge, queryClient }), bridge, queryClient }
}
