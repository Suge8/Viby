import type {
    LocalSessionExportRequest,
    OpenAgentConfigRequest,
    PairingPeerAgentConfigResult,
    PairingPeerAgentLaunchOptionsResult,
    PairingPeerApprovePermissionParams,
    PairingPeerBrowseDirectoryParams,
    PairingPeerBrowseDirectoryResult,
    PairingPeerCodexServiceTierParams,
    PairingPeerCollaborationModeParams,
    PairingPeerCommandCapabilitiesParams,
    PairingPeerCommandCapabilitiesResult,
    PairingPeerDeleteUploadResult,
    PairingPeerDenyPermissionParams,
    PairingPeerDriverSwitchParams,
    PairingPeerFilePathParams,
    PairingPeerFileReadResult,
    PairingPeerFileSearchResult,
    PairingPeerGitCommandResult,
    PairingPeerGitDiffFileParams,
    PairingPeerGitDiffNumstatParams,
    PairingPeerImportLocalSessionResult,
    PairingPeerListDirectoryParams,
    PairingPeerListDirectoryResult,
    PairingPeerListSessionsResult,
    PairingPeerLoadAfterParams,
    PairingPeerLoadAfterResult,
    PairingPeerMessagesParams,
    PairingPeerMessagesResult,
    PairingPeerModelParams,
    PairingPeerModelReasoningEffortParams,
    PairingPeerOpenAgentConfigResult,
    PairingPeerOpenSessionParams,
    PairingPeerOpenSessionResult,
    PairingPeerPathsExistParams,
    PairingPeerPathsExistResult,
    PairingPeerPermissionModeParams,
    PairingPeerPushSubscriptionParams,
    PairingPeerPushUnsubscribeParams,
    PairingPeerRenameSessionParams,
    PairingPeerRequest,
    PairingPeerRestoreAgentConfigResult,
    PairingPeerResumeSessionParams,
    PairingPeerResumeSessionResult,
    PairingPeerRuntimeCapabilityResult,
    PairingPeerRuntimeLocalSessionsResult,
    PairingPeerRuntimeSnapshotResult,
    PairingPeerSaveAgentConfigResult,
    PairingPeerSearchFilesParams,
    PairingPeerSendMessageParams,
    PairingPeerSendMessageResult,
    PairingPeerSessionParams,
    PairingPeerSessionResult,
    PairingPeerSpawnSessionParams,
    PairingPeerSpawnSessionResult,
    PairingPeerTerminalEventPayload,
    PairingPeerUploadResult,
    RestoreAgentConfigRequest,
    RuntimeAgentLaunchOptionsRequest,
    RuntimeCapabilityRequest,
    SaveAgentConfigRequest,
} from '@viby/protocol'
import type { SyncEvent } from '@/types/api'
import type { RemotePeerTransportStats } from './remotePairingStats'

export type RemotePeerBridge = {
    listSessions: () => Promise<PairingPeerListSessionsResult>
    openSession: (params: PairingPeerOpenSessionParams) => Promise<PairingPeerOpenSessionResult>
    resumeSession: (params: PairingPeerResumeSessionParams) => Promise<PairingPeerResumeSessionResult>
    loadAfter: (params: PairingPeerLoadAfterParams) => Promise<PairingPeerLoadAfterResult>
    getMessages: (params: PairingPeerMessagesParams) => Promise<PairingPeerMessagesResult>
    sendMessage: (params: PairingPeerSendMessageParams) => Promise<PairingPeerSendMessageResult>
    abortSession: (params: PairingPeerSessionParams) => Promise<PairingPeerSessionResult>
    archiveSession: (params: PairingPeerSessionParams) => Promise<PairingPeerSessionResult>
    closeSession: (params: PairingPeerSessionParams) => Promise<PairingPeerSessionResult>
    unarchiveSession: (params: PairingPeerSessionParams) => Promise<PairingPeerSessionResult>
    renameSession: (params: PairingPeerRenameSessionParams) => Promise<PairingPeerSessionResult>
    deleteSession: (params: PairingPeerSessionParams) => Promise<void>
    switchSessionDriver: (params: PairingPeerDriverSwitchParams) => Promise<PairingPeerSessionResult>
    setPermissionMode: (params: PairingPeerPermissionModeParams) => Promise<PairingPeerSessionResult>
    setCollaborationMode: (params: PairingPeerCollaborationModeParams) => Promise<PairingPeerSessionResult>
    setModel: (params: PairingPeerModelParams) => Promise<PairingPeerSessionResult>
    setModelReasoningEffort: (params: PairingPeerModelReasoningEffortParams) => Promise<PairingPeerSessionResult>
    setCodexServiceTier: (params: PairingPeerCodexServiceTierParams) => Promise<PairingPeerSessionResult>
    getCommandCapabilities: (
        params: PairingPeerCommandCapabilitiesParams
    ) => Promise<PairingPeerCommandCapabilitiesResult>
    approvePermission: (params: PairingPeerApprovePermissionParams) => Promise<void>
    denyPermission: (params: PairingPeerDenyPermissionParams) => Promise<void>
    getRuntime: () => Promise<PairingPeerRuntimeSnapshotResult>
    getRuntimeCapabilities: (params?: RuntimeCapabilityRequest) => Promise<PairingPeerRuntimeCapabilityResult>
    getAgentLaunchOptions: (params?: RuntimeAgentLaunchOptionsRequest) => Promise<PairingPeerAgentLaunchOptionsResult>
    getAgentConfig: () => Promise<PairingPeerAgentConfigResult>
    saveAgentConfig: (params: SaveAgentConfigRequest) => Promise<PairingPeerSaveAgentConfigResult>
    restoreAgentConfig: (params: RestoreAgentConfigRequest) => Promise<PairingPeerRestoreAgentConfigResult>
    openAgentConfig: (params: OpenAgentConfigRequest) => Promise<PairingPeerOpenAgentConfigResult>
    checkRuntimePathsExists: (params: PairingPeerPathsExistParams) => Promise<PairingPeerPathsExistResult>
    browseRuntimeDirectory: (params?: PairingPeerBrowseDirectoryParams) => Promise<PairingPeerBrowseDirectoryResult>
    listRuntimeLocalSessions: (
        params: Pick<LocalSessionExportRequest, 'path' | 'driver'>
    ) => Promise<PairingPeerRuntimeLocalSessionsResult>
    importRuntimeLocalSession: (params: LocalSessionExportRequest) => Promise<PairingPeerImportLocalSessionResult>
    spawnSession: (params: PairingPeerSpawnSessionParams) => Promise<PairingPeerSpawnSessionResult>
    getGitStatus: (params: PairingPeerSessionParams) => Promise<PairingPeerGitCommandResult>
    getGitDiffNumstat: (params: PairingPeerGitDiffNumstatParams) => Promise<PairingPeerGitCommandResult>
    getGitDiffFile: (params: PairingPeerGitDiffFileParams) => Promise<PairingPeerGitCommandResult>
    searchSessionFiles: (params: PairingPeerSearchFilesParams) => Promise<PairingPeerFileSearchResult>
    readSessionFile: (params: PairingPeerFilePathParams) => Promise<PairingPeerFileReadResult>
    listSessionDirectory: (params: PairingPeerListDirectoryParams) => Promise<PairingPeerListDirectoryResult>
    deleteUploadFile: (params: PairingPeerFilePathParams) => Promise<PairingPeerDeleteUploadResult>
    uploadFile: (sessionId: string, file: File, mimeType: string) => Promise<PairingPeerUploadResult>
    getPushVapidPublicKey: () => Promise<{ publicKey: string }>
    subscribePushNotifications: (params: PairingPeerPushSubscriptionParams) => Promise<void>
    unsubscribePushNotifications: (params: PairingPeerPushUnsubscribeParams) => Promise<void>
    openTerminal: (params: { sessionId: string; terminalId: string; cols: number; rows: number }) => Promise<void>
    writeTerminal: (params: { sessionId: string; terminalId: string; data: string }) => Promise<void>
    resizeTerminal: (params: { sessionId: string; terminalId: string; cols: number; rows: number }) => Promise<void>
    closeTerminal: (params: { sessionId: string; terminalId: string }) => Promise<void>
    subscribeTerminal: (listener: (event: PairingPeerTerminalEventPayload) => void) => () => void
    getTransportStats: () => Promise<RemotePeerTransportStats>
    subscribe: (listener: (event: SyncEvent) => void) => () => void
    onClose: (listener: (error: Error) => void) => () => void
    close: () => void
}

export type RemotePeerRequester = <T>(request: PairingPeerRequest, parse: (value: unknown) => T) => Promise<T>
