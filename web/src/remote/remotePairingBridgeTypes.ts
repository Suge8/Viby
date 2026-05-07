import type {
    ListAgentAvailabilityRequest,
    LocalSessionExportRequest,
    PairingPeerAgentAvailabilityResult,
    PairingPeerAgentLaunchConfigResult,
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
    PairingPeerModelParams,
    PairingPeerModelReasoningEffortParams,
    PairingPeerOpenSessionParams,
    PairingPeerOpenSessionResult,
    PairingPeerPathsExistParams,
    PairingPeerPathsExistResult,
    PairingPeerPermissionModeParams,
    PairingPeerPushSubscriptionParams,
    PairingPeerPushUnsubscribeParams,
    PairingPeerRenameSessionParams,
    PairingPeerRequest,
    PairingPeerResumeSessionParams,
    PairingPeerResumeSessionResult,
    PairingPeerRuntimeLocalSessionsResult,
    PairingPeerSearchFilesParams,
    PairingPeerSendMessageParams,
    PairingPeerSendMessageResult,
    PairingPeerSessionParams,
    PairingPeerSessionResult,
    PairingPeerSpawnSessionParams,
    PairingPeerSpawnSessionResult,
    PairingPeerTerminalEventPayload,
    PairingPeerUploadResult,
    ResolveAgentLaunchConfigRequest,
} from '@viby/protocol'
import type { SyncEvent } from '@/types/api'
import type { RemotePeerTransportStats } from './remotePairingStats'

export type RemotePeerBridge = {
    listSessions: () => Promise<PairingPeerListSessionsResult>
    openSession: (params: PairingPeerOpenSessionParams) => Promise<PairingPeerOpenSessionResult>
    resumeSession: (params: PairingPeerResumeSessionParams) => Promise<PairingPeerResumeSessionResult>
    loadAfter: (params: PairingPeerLoadAfterParams) => Promise<PairingPeerLoadAfterResult>
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
    getRuntimeAgentAvailability: (params?: ListAgentAvailabilityRequest) => Promise<PairingPeerAgentAvailabilityResult>
    checkRuntimePathsExists: (params: PairingPeerPathsExistParams) => Promise<PairingPeerPathsExistResult>
    browseRuntimeDirectory: (params?: PairingPeerBrowseDirectoryParams) => Promise<PairingPeerBrowseDirectoryResult>
    resolveAgentLaunchConfig: (params: ResolveAgentLaunchConfigRequest) => Promise<PairingPeerAgentLaunchConfigResult>
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
