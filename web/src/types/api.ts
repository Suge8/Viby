import type {
    AgentAvailabilityResponse,
    AgentFlavor,
    AgentLaunchConfig,
    CommandCapabilitiesResponse,
    CommandCapability,
    CommandCapabilityActionType,
    MachineCapability,
    MachineDirectoryEntry,
    MachineDirectoryRoot,
    MachineDirectoryRootKind,
    PiModelCapability,
    PiModelScope,
    DecryptedMessage as ProtocolDecryptedMessage,
    LocalSessionCapability as ProtocolLocalSessionCapability,
    LocalSessionCatalog as ProtocolLocalSessionCatalog,
    LocalSessionCatalogEntry as ProtocolLocalSessionCatalogEntry,
    LocalSessionExportRequest as ProtocolLocalSessionExportRequest,
    MachineDirectoryResponse as ProtocolMachineDirectoryResponse,
    SyncEvent as ProtocolSyncEvent,
    ResolveAgentLaunchConfigResponse,
    ResumableSessionsPage,
    ResumableSessionsResponse,
    ResumableSessionsSnapshot,
    Session,
    SessionActivityKind,
    SessionLifecycleState,
    SessionRecoveryPage,
    SessionStreamState,
    SessionSummary,
    SessionViewSnapshot,
    WorktreeMetadata,
} from '@viby/protocol/types'

export type {
    AgentAvailability,
    AgentAvailabilityResolution,
    AgentAvailabilityResponse,
    AgentAvailabilityStatus,
    AgentFlavor,
    AgentLaunchConfig,
    AgentState,
    AttachmentMetadata,
    ClaudeReasoningEffort,
    CodexCollaborationMode,
    CodexReasoningEffort,
    CommandCapabilitiesResponse,
    CommandCapability,
    CommandCapabilityActionType,
    ListAgentAvailabilityRequest,
    LocalSessionCapability,
    LocalSessionCatalog,
    LocalSessionCatalogEntry,
    LocalSessionExportRequest,
    LocalSessionExportSnapshot,
    LocalSessionTranscriptMessage,
    MachineCapability,
    MachineDirectoryEntry,
    MachineDirectoryResponse,
    MachineDirectoryRoot,
    MachineDirectoryRootKind,
    ModelReasoningEffort,
    PermissionMode,
    PiModelCapability,
    PiModelScope,
    ResolveAgentLaunchConfigResponse,
    ResumableSessionsPage,
    ResumableSessionsResponse,
    ResumableSessionsSnapshot,
    Session,
    SessionActivityKind,
    SessionLifecycleState,
    SessionRecoveryPage,
    SessionStreamState,
    SessionSummary,
    SessionSummaryMetadata,
    SessionViewSnapshot,
    TodoItem,
    WorktreeMetadata,
} from '@viby/protocol/types'

export type SessionMetadataSummary = {
    path: string
    host: string
    version?: string
    name?: string
    os?: string
    summary?: { text: string; updatedAt: number }
    tools?: string[]
    driver?: AgentFlavor | null
    worktree?: WorktreeMetadata
}

export type MessageStatus = 'sending' | 'sent' | 'failed'

export type DecryptedMessage = ProtocolDecryptedMessage & {
    status?: MessageStatus
    originalText?: string
}

export type RunnerState = {
    status?: string
    pid?: number
    httpPort?: number
    startedAt?: number
    shutdownRequestedAt?: number
    shutdownSource?: string
    lastSpawnError?: {
        message: string
        pid?: number
        exitCode?: number | null
        signal?: string | null
        at: number
    } | null
}

export type LocalRuntime = {
    id: string
    active: boolean
    metadata: {
        host: string
        platform: string
        vibyCliVersion: string
        displayName?: string
        capabilities?: MachineCapability[]
    } | null
    runnerState?: RunnerState | null
}

export type RuntimeDirectoryEntry = MachineDirectoryEntry
export type RuntimeDirectoryRoot = MachineDirectoryRoot
export type RuntimeDirectoryRootKind = MachineDirectoryRootKind

export type AuthResponse = {
    token: string
    user: {
        id: number
        username?: string
        firstName?: string
        lastName?: string
    }
}

export type SessionsResponse = { sessions: SessionSummary[] }
export type SessionResponse = { session: Session }
export type MessagesResponse = {
    messages: DecryptedMessage[]
    page: {
        limit: number
        beforeSeq: number | null
        nextBeforeSeq: number | null
        hasMore: boolean
    }
}

export type RuntimeResponse = { runtime: LocalRuntime | null }
export type RuntimeAgentAvailabilityResponse = AgentAvailabilityResponse
export type RuntimePathsExistsResponse = { exists: Record<string, boolean> }
export type RuntimeBrowseDirectoryResponse = ProtocolMachineDirectoryResponse
export type AgentLaunchConfigResponse = ResolveAgentLaunchConfigResponse
export type RuntimeLocalSessionsResponse = ProtocolLocalSessionCatalog
export type RuntimeImportLocalSessionResponse = { session: Session; imported: boolean }

export type SpawnResponse = { type: 'success'; session: Session } | { type: 'error'; message: string }

export type GitCommandResponse = {
    success: boolean
    stdout?: string
    stderr?: string
    exitCode?: number
    error?: string
}

export type FileSearchItem = {
    fileName: string
    filePath: string
    fullPath: string
    fileType: 'file' | 'folder'
}

export type FileSearchResponse = {
    success: boolean
    files?: FileSearchItem[]
    error?: string
}

export type DirectoryEntry = {
    name: string
    type: 'file' | 'directory' | 'other'
    size?: number
    modified?: number
}

export type ListDirectoryResponse = {
    success: boolean
    entries?: DirectoryEntry[]
    error?: string
}

export type FileReadResponse = {
    success: boolean
    content?: string
    error?: string
}

export type UploadFileResponse = {
    success: boolean
    path?: string
    error?: string
}

export type DeleteUploadResponse = {
    success: boolean
    error?: string
}

export type GitFileStatus = {
    fileName: string
    filePath: string
    fullPath: string
    status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflicted'
    isStaged: boolean
    linesAdded: number
    linesRemoved: number
    oldPath?: string
}

export type GitStatusFiles = {
    stagedFiles: GitFileStatus[]
    unstagedFiles: GitFileStatus[]
    branch: string | null
    totalStaged: number
    totalUnstaged: number
}

export type PushSubscriptionKeys = {
    p256dh: string
    auth: string
}

export type PushSubscriptionPayload = {
    endpoint: string
    keys: PushSubscriptionKeys
}

export type PushUnsubscribePayload = {
    endpoint: string
}

export type PushVapidPublicKeyResponse = {
    publicKey: string
}

export type SyncEvent = ProtocolSyncEvent
