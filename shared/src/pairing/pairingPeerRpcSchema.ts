import { z } from 'zod'
import {
    AgentConfigResponseSchema,
    OpenAgentConfigRequestSchema,
    OpenAgentConfigResponseSchema,
    RestoreAgentConfigRequestSchema,
    RestoreAgentConfigResponseSchema,
    SaveAgentConfigRequestSchema,
    SaveAgentConfigResponseSchema,
} from '../agentConfig'
import { RuntimeAgentLaunchOptionsRequestSchema, RuntimeAgentLaunchOptionsResponseSchema } from '../agentLaunchOptions'
import { normalizeProtocolVersion } from '../buildCompatibility'
import { MACHINE_CAPABILITIES } from '../machineCapabilities'
import { MachineDirectoryResponseSchema } from '../machineDirectory'
import { RuntimeCapabilityRequestSchema, RuntimeCapabilityResponseSchema } from '../runtimeCapability'
import {
    CodexServiceTierSchema,
    ModelReasoningEffortSchema,
    PermissionModeSchema,
    SessionDriverSchema,
    SessionSchema,
    SessionSendMessageResultSchema,
    SyncEventSchema,
} from '../schemas'
import {
    createOptionalPairingPeerRequestSchema,
    createPairingPeerRequestSchema,
    PairingPeerRequestIdSchema,
} from './pairingPeerRequestSchemaBase'

export * from './pairingPeerSessionRpcSchema'

import {
    PairingPeerAbortSessionRequestSchema,
    PairingPeerApprovePermissionRequestSchema,
    PairingPeerArchiveSessionRequestSchema,
    PairingPeerCloseSessionRequestSchema,
    PairingPeerCodexServiceTierRequestSchema,
    PairingPeerCollaborationModeRequestSchema,
    PairingPeerCommandCapabilitiesRequestSchema,
    PairingPeerDeleteSessionRequestSchema,
    PairingPeerDeleteUploadRequestSchema,
    PairingPeerDenyPermissionRequestSchema,
    PairingPeerDriverSwitchRequestSchema,
    PairingPeerGitDiffFileRequestSchema,
    PairingPeerGitDiffNumstatRequestSchema,
    PairingPeerGitStatusRequestSchema,
    PairingPeerImportLocalSessionRequestSchema,
    PairingPeerListDirectoryRequestSchema,
    PairingPeerModelReasoningEffortRequestSchema,
    PairingPeerModelRequestSchema,
    PairingPeerPermissionModeRequestSchema,
    PairingPeerReadFileRequestSchema,
    PairingPeerRenameSessionRequestSchema,
    PairingPeerRuntimeLocalSessionsRequestSchema,
    PairingPeerSearchFilesRequestSchema,
    PairingPeerUnarchiveSessionRequestSchema,
} from './pairingPeerRpcExtendedSchema'
import {
    PairingPeerListSessionsRequestSchema,
    PairingPeerLoadAfterRequestSchema,
    PairingPeerMessagesRequestSchema,
    PairingPeerOpenSessionRequestSchema,
    PairingPeerResumeSessionRequestSchema,
} from './pairingPeerSessionRpcSchema'
import {
    PairingPeerPushSubscribeRequestSchema,
    PairingPeerPushUnsubscribeRequestSchema,
    PairingPeerPushVapidRequestSchema,
    PairingPeerTerminalCloseRequestSchema,
    PairingPeerTerminalEventPayloadSchema,
    PairingPeerTerminalOpenRequestSchema,
    PairingPeerTerminalResizeRequestSchema,
    PairingPeerTerminalWriteRequestSchema,
    PairingPeerUploadCancelRequestSchema,
    PairingPeerUploadCompleteRequestSchema,
    PairingPeerUploadStartRequestSchema,
} from './pairingPeerTerminalSchema'
import { PairingErrorPayloadSchema } from './pairingSchemaBase'

export const PairingPeerSendMessageParamsSchema = z.object({
    sessionId: z.string().min(1),
    text: z.string(),
    localId: z.string().min(1).optional(),
})
export type PairingPeerSendMessageParams = z.infer<typeof PairingPeerSendMessageParamsSchema>
export const PairingPeerPathsExistParamsSchema = z.object({
    paths: z.array(z.string().trim().min(1)).min(1).max(1000),
})
export type PairingPeerPathsExistParams = z.infer<typeof PairingPeerPathsExistParamsSchema>
export const PairingPeerBrowseDirectoryParamsSchema = z.object({
    path: z.string().min(1).optional(),
    workspaceRoot: z.string().min(1).optional(),
})
export type PairingPeerBrowseDirectoryParams = z.infer<typeof PairingPeerBrowseDirectoryParamsSchema>
export const PairingPeerSpawnSessionParamsSchema = z.object({
    directory: z.string().min(1),
    agent: SessionDriverSchema.optional(),
    model: z.string().optional(),
    modelReasoningEffort: ModelReasoningEffortSchema.optional(),
    codexServiceTier: CodexServiceTierSchema.optional(),
    permissionMode: PermissionModeSchema.optional(),
    sessionType: z.enum(['simple', 'worktree']).optional(),
    worktreeName: z.string().min(1).optional(),
    collaborationMode: z.enum(['default', 'plan']).optional(),
})
export type PairingPeerSpawnSessionParams = z.infer<typeof PairingPeerSpawnSessionParamsSchema>

export const PairingPeerSendMessageResultSchema = SessionSendMessageResultSchema
export type PairingPeerSendMessageResult = z.infer<typeof PairingPeerSendMessageResultSchema>

export const PairingPeerPathsExistResultSchema = z.object({ exists: z.record(z.string(), z.boolean()) })
export type PairingPeerPathsExistResult = z.infer<typeof PairingPeerPathsExistResultSchema>

export const PairingPeerBrowseDirectoryResultSchema = MachineDirectoryResponseSchema
export type PairingPeerBrowseDirectoryResult = z.infer<typeof PairingPeerBrowseDirectoryResultSchema>

const PairingPeerRuntimeMachineSchema = z.object({
    id: z.string().min(1),
    active: z.boolean(),
    metadata: z
        .object({
            host: z.string(),
            platform: z.string(),
            appCoreVersion: z.string(),
            displayName: z.string().optional(),
            capabilities: z.array(z.enum(MACHINE_CAPABILITIES)).optional(),
        })
        .passthrough()
        .nullable(),
    runtimeState: z.unknown().nullable().optional(),
})

export const PairingPeerRuntimeSnapshotResultSchema = z.object({ runtime: PairingPeerRuntimeMachineSchema.nullable() })
export type PairingPeerRuntimeSnapshotResult = z.infer<typeof PairingPeerRuntimeSnapshotResultSchema>

export const PairingPeerRuntimeCapabilityResultSchema = RuntimeCapabilityResponseSchema
export type PairingPeerRuntimeCapabilityResult = z.infer<typeof PairingPeerRuntimeCapabilityResultSchema>

export const PairingPeerAgentConfigResultSchema = AgentConfigResponseSchema
export type PairingPeerAgentConfigResult = z.infer<typeof PairingPeerAgentConfigResultSchema>

export const PairingPeerSaveAgentConfigResultSchema = SaveAgentConfigResponseSchema
export type PairingPeerSaveAgentConfigResult = z.infer<typeof PairingPeerSaveAgentConfigResultSchema>

export const PairingPeerRestoreAgentConfigResultSchema = RestoreAgentConfigResponseSchema
export type PairingPeerRestoreAgentConfigResult = z.infer<typeof PairingPeerRestoreAgentConfigResultSchema>

export const PairingPeerOpenAgentConfigResultSchema = OpenAgentConfigResponseSchema
export type PairingPeerOpenAgentConfigResult = z.infer<typeof PairingPeerOpenAgentConfigResultSchema>

export const PairingPeerAgentLaunchOptionsResultSchema = RuntimeAgentLaunchOptionsResponseSchema
export type PairingPeerAgentLaunchOptionsResult = z.infer<typeof PairingPeerAgentLaunchOptionsResultSchema>

export const PairingPeerSpawnSessionResultSchema = z.union([
    z.object({ type: z.literal('success'), session: SessionSchema }),
    z.object({ type: z.literal('error'), message: z.string() }),
])
export type PairingPeerSpawnSessionResult = z.infer<typeof PairingPeerSpawnSessionResultSchema>

export { PairingPeerRequestIdSchema }

export const PairingPeerSendMessageRequestSchema = createPairingPeerRequestSchema(
    'session.send',
    PairingPeerSendMessageParamsSchema
)
export const PairingPeerRuntimeSnapshotRequestSchema = createOptionalPairingPeerRequestSchema(
    'runtime.snapshot',
    z.object({})
)
export const PairingPeerRuntimeCapabilityRequestSchema = createOptionalPairingPeerRequestSchema(
    'runtime.capabilities',
    RuntimeCapabilityRequestSchema
)
export const PairingPeerAgentConfigRequestSchema = createOptionalPairingPeerRequestSchema(
    'runtime.agent-config',
    z.object({})
)
export const PairingPeerSaveAgentConfigRequestSchema = createPairingPeerRequestSchema(
    'runtime.save-agent-config',
    SaveAgentConfigRequestSchema
)
export const PairingPeerRestoreAgentConfigRequestSchema = createPairingPeerRequestSchema(
    'runtime.restore-agent-config',
    RestoreAgentConfigRequestSchema
)
export const PairingPeerOpenAgentConfigRequestSchema = createPairingPeerRequestSchema(
    'runtime.open-agent-config',
    OpenAgentConfigRequestSchema
)
export const PairingPeerPathsExistRequestSchema = createPairingPeerRequestSchema(
    'runtime.paths-exists',
    PairingPeerPathsExistParamsSchema
)
export const PairingPeerBrowseDirectoryRequestSchema = createOptionalPairingPeerRequestSchema(
    'runtime.browse-directory',
    PairingPeerBrowseDirectoryParamsSchema
)
export const PairingPeerAgentLaunchOptionsRequestSchema = createOptionalPairingPeerRequestSchema(
    'runtime.agent-launch-options',
    RuntimeAgentLaunchOptionsRequestSchema
)
export const PairingPeerSpawnSessionRequestSchema = createPairingPeerRequestSchema(
    'runtime.spawn',
    PairingPeerSpawnSessionParamsSchema
)

const PairingPeerRequestSchemas = [
    PairingPeerListSessionsRequestSchema,
    PairingPeerOpenSessionRequestSchema,
    PairingPeerResumeSessionRequestSchema,
    PairingPeerLoadAfterRequestSchema,
    PairingPeerMessagesRequestSchema,
    PairingPeerSendMessageRequestSchema,
    PairingPeerAbortSessionRequestSchema,
    PairingPeerArchiveSessionRequestSchema,
    PairingPeerCloseSessionRequestSchema,
    PairingPeerUnarchiveSessionRequestSchema,
    PairingPeerRenameSessionRequestSchema,
    PairingPeerDeleteSessionRequestSchema,
    PairingPeerDriverSwitchRequestSchema,
    PairingPeerPermissionModeRequestSchema,
    PairingPeerCollaborationModeRequestSchema,
    PairingPeerModelRequestSchema,
    PairingPeerModelReasoningEffortRequestSchema,
    PairingPeerCodexServiceTierRequestSchema,
    PairingPeerCommandCapabilitiesRequestSchema,
    PairingPeerApprovePermissionRequestSchema,
    PairingPeerDenyPermissionRequestSchema,
    PairingPeerRuntimeSnapshotRequestSchema,
    PairingPeerRuntimeCapabilityRequestSchema,
    PairingPeerAgentLaunchOptionsRequestSchema,
    PairingPeerAgentConfigRequestSchema,
    PairingPeerSaveAgentConfigRequestSchema,
    PairingPeerRestoreAgentConfigRequestSchema,
    PairingPeerOpenAgentConfigRequestSchema,
    PairingPeerPathsExistRequestSchema,
    PairingPeerBrowseDirectoryRequestSchema,
    PairingPeerSpawnSessionRequestSchema,
    PairingPeerRuntimeLocalSessionsRequestSchema,
    PairingPeerImportLocalSessionRequestSchema,
    PairingPeerGitStatusRequestSchema,
    PairingPeerGitDiffNumstatRequestSchema,
    PairingPeerGitDiffFileRequestSchema,
    PairingPeerSearchFilesRequestSchema,
    PairingPeerReadFileRequestSchema,
    PairingPeerListDirectoryRequestSchema,
    PairingPeerDeleteUploadRequestSchema,
    PairingPeerUploadStartRequestSchema,
    PairingPeerUploadCompleteRequestSchema,
    PairingPeerUploadCancelRequestSchema,
    PairingPeerTerminalOpenRequestSchema,
    PairingPeerTerminalWriteRequestSchema,
    PairingPeerTerminalResizeRequestSchema,
    PairingPeerTerminalCloseRequestSchema,
    PairingPeerPushVapidRequestSchema,
    PairingPeerPushSubscribeRequestSchema,
    PairingPeerPushUnsubscribeRequestSchema,
] as const

export const PairingPeerRequestSchema = z.discriminatedUnion('method', PairingPeerRequestSchemas)
export type PairingPeerRequest = z.infer<typeof PairingPeerRequestSchema>
export type PairingPeerMethod = PairingPeerRequest['method']

const PairingPeerMethodValues = PairingPeerRequestSchemas.map((schema) => schema.shape.method.value)
export const PairingPeerMethodSchema = z.enum(PairingPeerMethodValues as [PairingPeerMethod, ...PairingPeerMethod[]])

export const PairingPeerResponseSuccessSchema = z.object({
    kind: z.literal('response'),
    id: PairingPeerRequestIdSchema,
    ok: z.literal(true),
    result: z.unknown(),
})
export const PairingPeerResponseErrorSchema = z.object({
    kind: z.literal('response'),
    id: PairingPeerRequestIdSchema,
    ok: z.literal(false),
    error: PairingErrorPayloadSchema,
})
export const PairingPeerResponseSchema = z.discriminatedUnion('ok', [
    PairingPeerResponseSuccessSchema,
    PairingPeerResponseErrorSchema,
])
export type PairingPeerResponse = z.infer<typeof PairingPeerResponseSchema>

const PairingPeerEventSeqSchema = z.number().int().positive().optional()

export const PairingPeerSyncEventSchema = z.object({
    kind: z.literal('event'),
    event: z.literal('sync-event'),
    payload: SyncEventSchema,
    seq: PairingPeerEventSeqSchema,
})
export const PairingPeerTerminalEventSchema = z.object({
    kind: z.literal('event'),
    event: z.literal('terminal-event'),
    payload: PairingPeerTerminalEventPayloadSchema,
    seq: PairingPeerEventSeqSchema,
})
export const PairingPeerEventSchema = z.discriminatedUnion('event', [
    PairingPeerSyncEventSchema,
    PairingPeerTerminalEventSchema,
])
export type PairingPeerEvent = z.infer<typeof PairingPeerEventSchema>

export const PairingPeerHeartbeatSchema = z.object({
    kind: z.literal('heartbeat'),
    ack: z.boolean().optional(),
    id: z.string().min(1).optional(),
    sentAt: z.number().int().nonnegative().optional(),
    lastSeenSeq: z.number().int().nonnegative().optional(),
    protocolVersion: z.preprocess(
        (value) => normalizeProtocolVersion(value) ?? undefined,
        z.number().int().positive().optional()
    ),
})
export type PairingPeerHeartbeat = z.infer<typeof PairingPeerHeartbeatSchema>

export const PairingPeerMessageSchema = z.union([
    PairingPeerRequestSchema,
    PairingPeerResponseSchema,
    PairingPeerEventSchema,
    PairingPeerHeartbeatSchema,
])
export type PairingPeerMessage = z.infer<typeof PairingPeerMessageSchema>
