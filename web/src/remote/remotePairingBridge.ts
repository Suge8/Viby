import {
    PairingPeerAgentAvailabilityResultSchema,
    PairingPeerAgentLaunchConfigResultSchema,
    PairingPeerBrowseDirectoryResultSchema,
    PairingPeerCommandCapabilitiesResultSchema,
    PairingPeerDeleteUploadResultSchema,
    PairingPeerFileReadResultSchema,
    PairingPeerFileSearchResultSchema,
    PairingPeerGitCommandResultSchema,
    PairingPeerImportLocalSessionResultSchema,
    PairingPeerListDirectoryResultSchema,
    PairingPeerListSessionsResultSchema,
    PairingPeerLoadAfterResultSchema,
    PairingPeerOpenSessionResultSchema,
    PairingPeerPathsExistResultSchema,
    PairingPeerPushVapidResultSchema,
    PairingPeerResumeSessionResultSchema,
    PairingPeerRuntimeLocalSessionsResultSchema,
    PairingPeerSendMessageResultSchema,
    PairingPeerSessionResultSchema,
    PairingPeerSpawnSessionResultSchema,
} from '@viby/protocol'
import type { RemotePeerBridge, RemotePeerRequester } from './remotePairingBridgeTypes'
import { createRemotePeerRequest } from './remotePairingRpc'

export type { RemotePeerBridge, RemotePeerRequester } from './remotePairingBridgeTypes'

export function createRemotePeerBridge(options: {
    requestPeer: RemotePeerRequester
    subscribe: RemotePeerBridge['subscribe']
    onClose: RemotePeerBridge['onClose']
    close: RemotePeerBridge['close']
    getTransportStats: RemotePeerBridge['getTransportStats']
    uploadFile: RemotePeerBridge['uploadFile']
    subscribeTerminal: RemotePeerBridge['subscribeTerminal']
}): RemotePeerBridge {
    return {
        listSessions: () =>
            options.requestPeer(createRemotePeerRequest('sessions.list'), PairingPeerListSessionsResultSchema.parse),
        openSession: (params) =>
            options.requestPeer(
                createRemotePeerRequest('session.open', params),
                PairingPeerOpenSessionResultSchema.parse
            ),
        resumeSession: (params) =>
            options.requestPeer(
                createRemotePeerRequest('session.resume', params),
                PairingPeerResumeSessionResultSchema.parse
            ),
        loadAfter: (params) =>
            options.requestPeer(
                createRemotePeerRequest('session.load-after', params),
                PairingPeerLoadAfterResultSchema.parse
            ),
        sendMessage: (params) =>
            options.requestPeer(
                createRemotePeerRequest('session.send', params),
                PairingPeerSendMessageResultSchema.parse
            ),
        abortSession: (params) =>
            options.requestPeer(createRemotePeerRequest('session.abort', params), PairingPeerSessionResultSchema.parse),
        archiveSession: (params) =>
            options.requestPeer(
                createRemotePeerRequest('session.archive', params),
                PairingPeerSessionResultSchema.parse
            ),
        closeSession: (params) =>
            options.requestPeer(createRemotePeerRequest('session.close', params), PairingPeerSessionResultSchema.parse),
        unarchiveSession: (params) =>
            options.requestPeer(
                createRemotePeerRequest('session.unarchive', params),
                PairingPeerSessionResultSchema.parse
            ),
        renameSession: (params) =>
            options.requestPeer(
                createRemotePeerRequest('session.rename', params),
                PairingPeerSessionResultSchema.parse
            ),
        deleteSession: async (params) => {
            await options.requestPeer(createRemotePeerRequest('session.delete', params), () => undefined)
        },
        switchSessionDriver: (params) =>
            options.requestPeer(
                createRemotePeerRequest('session.driver-switch', params),
                PairingPeerSessionResultSchema.parse
            ),
        setPermissionMode: (params) =>
            options.requestPeer(
                createRemotePeerRequest('session.permission-mode', params),
                PairingPeerSessionResultSchema.parse
            ),
        setCollaborationMode: (params) =>
            options.requestPeer(
                createRemotePeerRequest('session.collaboration-mode', params),
                PairingPeerSessionResultSchema.parse
            ),
        setModel: (params) =>
            options.requestPeer(createRemotePeerRequest('session.model', params), PairingPeerSessionResultSchema.parse),
        setModelReasoningEffort: (params) =>
            options.requestPeer(
                createRemotePeerRequest('session.model-reasoning-effort', params),
                PairingPeerSessionResultSchema.parse
            ),
        setCodexServiceTier: (params) =>
            options.requestPeer(
                createRemotePeerRequest('session.codex-service-tier', params),
                PairingPeerSessionResultSchema.parse
            ),
        getCommandCapabilities: (params) =>
            options.requestPeer(
                createRemotePeerRequest('session.command-capabilities', params),
                PairingPeerCommandCapabilitiesResultSchema.parse
            ),
        approvePermission: async (params) => {
            await options.requestPeer(createRemotePeerRequest('permission.approve', params), () => undefined)
        },
        denyPermission: async (params) => {
            await options.requestPeer(createRemotePeerRequest('permission.deny', params), () => undefined)
        },
        getRuntimeAgentAvailability: (params) =>
            options.requestPeer(
                createRemotePeerRequest('runtime.agent-availability', params),
                PairingPeerAgentAvailabilityResultSchema.parse
            ),
        checkRuntimePathsExists: (params) =>
            options.requestPeer(
                createRemotePeerRequest('runtime.paths-exists', params),
                PairingPeerPathsExistResultSchema.parse
            ),
        browseRuntimeDirectory: (params) =>
            options.requestPeer(
                createRemotePeerRequest('runtime.browse-directory', params),
                PairingPeerBrowseDirectoryResultSchema.parse
            ),
        resolveAgentLaunchConfig: (params) =>
            options.requestPeer(
                createRemotePeerRequest('runtime.agent-launch-config', params),
                PairingPeerAgentLaunchConfigResultSchema.parse
            ),
        listRuntimeLocalSessions: (params) =>
            options.requestPeer(
                createRemotePeerRequest('runtime.local-sessions', params),
                PairingPeerRuntimeLocalSessionsResultSchema.parse
            ),
        importRuntimeLocalSession: (params) =>
            options.requestPeer(
                createRemotePeerRequest('runtime.import-local-session', params),
                PairingPeerImportLocalSessionResultSchema.parse
            ),
        spawnSession: (params) =>
            options.requestPeer(
                createRemotePeerRequest('runtime.spawn', params),
                PairingPeerSpawnSessionResultSchema.parse
            ),
        getGitStatus: (params) =>
            options.requestPeer(
                createRemotePeerRequest('workspace.git-status', params),
                PairingPeerGitCommandResultSchema.parse
            ),
        getGitDiffNumstat: (params) =>
            options.requestPeer(
                createRemotePeerRequest('workspace.git-diff-numstat', params),
                PairingPeerGitCommandResultSchema.parse
            ),
        getGitDiffFile: (params) =>
            options.requestPeer(
                createRemotePeerRequest('workspace.git-diff-file', params),
                PairingPeerGitCommandResultSchema.parse
            ),
        searchSessionFiles: (params) =>
            options.requestPeer(
                createRemotePeerRequest('workspace.search-files', params),
                PairingPeerFileSearchResultSchema.parse
            ),
        readSessionFile: (params) =>
            options.requestPeer(
                createRemotePeerRequest('workspace.read-file', params),
                PairingPeerFileReadResultSchema.parse
            ),
        listSessionDirectory: (params) =>
            options.requestPeer(
                createRemotePeerRequest('workspace.list-directory', params),
                PairingPeerListDirectoryResultSchema.parse
            ),
        deleteUploadFile: (params) =>
            options.requestPeer(
                createRemotePeerRequest('session.delete-upload', params),
                PairingPeerDeleteUploadResultSchema.parse
            ),
        uploadFile: options.uploadFile,
        getPushVapidPublicKey: () =>
            options.requestPeer(
                createRemotePeerRequest('push.vapid-public-key'),
                PairingPeerPushVapidResultSchema.parse
            ),
        subscribePushNotifications: async (params) => {
            await options.requestPeer(createRemotePeerRequest('push.subscribe', params), () => undefined)
        },
        unsubscribePushNotifications: async (params) => {
            await options.requestPeer(createRemotePeerRequest('push.unsubscribe', params), () => undefined)
        },
        openTerminal: async (params) => {
            await options.requestPeer(createRemotePeerRequest('terminal.open', params), () => undefined)
        },
        writeTerminal: async (params) => {
            await options.requestPeer(createRemotePeerRequest('terminal.write', params), () => undefined)
        },
        resizeTerminal: async (params) => {
            await options.requestPeer(createRemotePeerRequest('terminal.resize', params), () => undefined)
        },
        closeTerminal: async (params) => {
            await options.requestPeer(createRemotePeerRequest('terminal.close', params), () => undefined)
        },
        subscribeTerminal: options.subscribeTerminal,
        getTransportStats: options.getTransportStats,
        subscribe: options.subscribe,
        onClose: options.onClose,
        close: options.close,
    }
}
