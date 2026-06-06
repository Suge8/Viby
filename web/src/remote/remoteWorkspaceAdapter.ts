import type { QueryClient } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import type { ApiClient } from '@/api/client'
import type { ReadyAppSession } from '@/components/appControllerSupport'
import type { RuntimeSnapshotApi } from '@/hooks/queries/useRuntime'
import { type AppApi, AppContextProvider } from '@/lib/app-context'
import type { SyncEvent } from '@/types/api'
import type { RemotePeerBridge } from './remotePairingBridgeTypes'
import type { RemotePeerTransportStats } from './remotePairingStats'
import { createRemotePeerApiClient } from './remotePeerApiClient'

export type RemoteWorkspaceRuntime = {
    noticeApi: RuntimeSnapshotApi
    getTransportStats: () => Promise<RemotePeerTransportStats>
    subscribe: (listener: (event: SyncEvent) => void) => () => void
}

export type WorkspaceAdapter = {
    appSession: ReadyAppSession
    runtime: RemoteWorkspaceRuntime
}

export type RemoteWorkspaceAdapter = WorkspaceAdapter

const REMOTE_WORKSPACE_API_METHODS = [
    'abortSession',
    'approvePermission',
    'archiveSession',
    'browseRuntimeDirectory',
    'checkRuntimePathsExists',
    'closeSession',
    'deleteSession',
    'deleteUploadFile',
    'denyPermission',
    'getAgentConfig',
    'getCommandCapabilities',
    'getGitDiffFile',
    'getGitDiffNumstat',
    'getGitStatus',
    'getMessages',
    'getPushVapidPublicKey',
    'getResumableSessions',
    'getRuntime',
    'getRuntimeAgentAvailability',
    'getRuntimeCapabilities',
    'getSession',
    'getSessionRecovery',
    'getSessionView',
    'getSessions',
    'importRuntimeLocalSession',
    'listRuntimeLocalSessions',
    'listSessionDirectory',
    'openAgentConfig',
    'readSessionFile',
    'renameSession',
    'resolveAgentLaunchConfig',
    'restoreAgentConfig',
    'resumeSession',
    'saveAgentConfig',
    'searchSessionFiles',
    'sendMessage',
    'setCodexServiceTier',
    'setCollaborationMode',
    'setModel',
    'setModelReasoningEffort',
    'setPermissionMode',
    'spawnSession',
    'subscribePushNotifications',
    'switchSessionDriver',
    'unarchiveSession',
    'unsubscribePushNotifications',
    'uploadFile',
] as const

function pickWorkspaceApiMethod<Method extends keyof ApiClient>(api: ApiClient, method: Method): ApiClient[Method] {
    const candidate = api[method]
    return typeof candidate === 'function' ? (candidate.bind(api) as ApiClient[Method]) : candidate
}

function createRemoteWorkspaceAppApi(api: ApiClient): AppApi {
    const appApi: Record<string, unknown> = {}
    for (const method of REMOTE_WORKSPACE_API_METHODS) {
        appApi[method] = pickWorkspaceApiMethod(api, method)
    }
    return appApi as unknown as AppApi
}

export function createRemoteWorkspaceAdapter(options: {
    baseUrl: string
    bridge: RemotePeerBridge
    queryClient: QueryClient
    token: string
}): RemoteWorkspaceAdapter {
    const api = createRemotePeerApiClient({ bridge: options.bridge, queryClient: options.queryClient })
    const appApi = createRemoteWorkspaceAppApi(api)
    const renderAppProvider = (children: ReactNode) =>
        createElement(AppContextProvider, {
            children,
            value: { api: appApi, baseUrl: options.baseUrl, token: options.token },
        })

    return {
        appSession: {
            baseUrl: options.baseUrl,
            renderAppProvider,
        },
        runtime: {
            noticeApi: { getRuntime: appApi.getRuntime },
            getTransportStats: () => options.bridge.getTransportStats(),
            subscribe: (listener) => options.bridge.subscribe(listener),
        },
    }
}
