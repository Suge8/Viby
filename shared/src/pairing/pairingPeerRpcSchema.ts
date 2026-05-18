import { z } from 'zod'
import { AgentAvailabilityResponseSchema, ListAgentAvailabilityRequestSchema } from '../agentAvailability'
import {
    AgentConfigResponseSchema,
    RestoreAgentConfigRequestSchema,
    RestoreAgentConfigResponseSchema,
    SaveAgentConfigRequestSchema,
    SaveAgentConfigResponseSchema,
} from '../agentConfig'
import { ResolveAgentLaunchConfigRequestSchema, ResolveAgentLaunchConfigResponseSchema } from '../agentLaunchConfig'
import { MachineDirectoryResponseSchema } from '../machineDirectory'
import { RuntimeCapabilityRequestSchema, RuntimeCapabilityResponseSchema } from '../runtimeCapability'
import {
    CodexServiceTierSchema,
    DecryptedMessageSchema,
    ModelReasoningEffortSchema,
    PermissionModeSchema,
    SessionDriverSchema,
    SessionSchema,
    SyncEventSchema,
} from '../schemas'
import { SessionViewSnapshotSchema } from '../sessionView'
import {
    createOptionalPairingPeerRequestSchema,
    createPairingPeerRequestSchema,
    PairingPeerRequestIdSchema,
} from './pairingPeerRequestSchemaBase'
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

export const PairingRemoteSessionSummarySchema = z.object({
    id: z.string().min(1),
    active: z.boolean(),
    thinking: z.boolean(),
    updatedAt: z.number().int().nonnegative(),
    latestActivityAt: z.number().int().nonnegative().nullable(),
    lifecycleState: z.enum(['running', 'open', 'closed', 'archived']),
    resumeAvailable: z.boolean(),
    model: z.string().nullable(),
    codexServiceTier: CodexServiceTierSchema.nullable(),
    metadata: z
        .object({
            name: z.string().min(1).optional(),
            path: z.string().min(1),
            driver: SessionDriverSchema.nullish().optional(),
            summary: z.object({ text: z.string().min(1), updatedAt: z.number().int().nonnegative() }).optional(),
        })
        .nullable(),
})
export type PairingRemoteSessionSummary = z.infer<typeof PairingRemoteSessionSummarySchema>

export const PairingPeerListSessionsParamsSchema = z.object({})
export type PairingPeerListSessionsParams = z.infer<typeof PairingPeerListSessionsParamsSchema>
export const PairingPeerOpenSessionParamsSchema = z.object({ sessionId: z.string().min(1) })
export type PairingPeerOpenSessionParams = z.infer<typeof PairingPeerOpenSessionParamsSchema>
export const PairingPeerResumeSessionParamsSchema = z.object({ sessionId: z.string().min(1) })
export type PairingPeerResumeSessionParams = z.infer<typeof PairingPeerResumeSessionParamsSchema>
export const PairingPeerLoadAfterParamsSchema = z.object({
    sessionId: z.string().min(1),
    afterSeq: z.number().int().min(0),
    limit: z.number().int().positive().max(200).optional(),
})
export type PairingPeerLoadAfterParams = z.infer<typeof PairingPeerLoadAfterParamsSchema>
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

export const PairingPeerListSessionsResultSchema = z.object({ sessions: z.array(PairingRemoteSessionSummarySchema) })
export type PairingPeerListSessionsResult = z.infer<typeof PairingPeerListSessionsResultSchema>

export const PairingPeerOpenSessionResultSchema = SessionViewSnapshotSchema
export type PairingPeerOpenSessionResult = z.infer<typeof PairingPeerOpenSessionResultSchema>

export const PairingPeerResumeSessionResultSchema = SessionViewSnapshotSchema
export type PairingPeerResumeSessionResult = z.infer<typeof PairingPeerResumeSessionResultSchema>

export const PairingPeerLoadAfterResultSchema = z.object({
    messages: z.array(DecryptedMessageSchema),
    nextAfterSeq: z.number().int().min(0),
})
export type PairingPeerLoadAfterResult = z.infer<typeof PairingPeerLoadAfterResultSchema>

export const PairingPeerSendMessageResultSchema = z.object({ session: SessionSchema })
export type PairingPeerSendMessageResult = z.infer<typeof PairingPeerSendMessageResultSchema>

export const PairingPeerPathsExistResultSchema = z.object({ exists: z.record(z.string(), z.boolean()) })
export type PairingPeerPathsExistResult = z.infer<typeof PairingPeerPathsExistResultSchema>

export const PairingPeerBrowseDirectoryResultSchema = MachineDirectoryResponseSchema
export type PairingPeerBrowseDirectoryResult = z.infer<typeof PairingPeerBrowseDirectoryResultSchema>

export const PairingPeerRuntimeCapabilityResultSchema = RuntimeCapabilityResponseSchema
export type PairingPeerRuntimeCapabilityResult = z.infer<typeof PairingPeerRuntimeCapabilityResultSchema>

export const PairingPeerAgentAvailabilityResultSchema = AgentAvailabilityResponseSchema
export type PairingPeerAgentAvailabilityResult = z.infer<typeof PairingPeerAgentAvailabilityResultSchema>

export const PairingPeerAgentConfigResultSchema = AgentConfigResponseSchema
export type PairingPeerAgentConfigResult = z.infer<typeof PairingPeerAgentConfigResultSchema>

export const PairingPeerSaveAgentConfigResultSchema = SaveAgentConfigResponseSchema
export type PairingPeerSaveAgentConfigResult = z.infer<typeof PairingPeerSaveAgentConfigResultSchema>

export const PairingPeerRestoreAgentConfigResultSchema = RestoreAgentConfigResponseSchema
export type PairingPeerRestoreAgentConfigResult = z.infer<typeof PairingPeerRestoreAgentConfigResultSchema>

export const PairingPeerAgentLaunchConfigResultSchema = ResolveAgentLaunchConfigResponseSchema
export type PairingPeerAgentLaunchConfigResult = z.infer<typeof PairingPeerAgentLaunchConfigResultSchema>

export const PairingPeerSpawnSessionResultSchema = z.union([
    z.object({ type: z.literal('success'), session: SessionSchema }),
    z.object({ type: z.literal('error'), message: z.string() }),
])
export type PairingPeerSpawnSessionResult = z.infer<typeof PairingPeerSpawnSessionResultSchema>

export { PairingPeerRequestIdSchema }

export const PairingPeerListSessionsRequestSchema = createOptionalPairingPeerRequestSchema(
    'sessions.list',
    PairingPeerListSessionsParamsSchema
)
export const PairingPeerOpenSessionRequestSchema = createPairingPeerRequestSchema(
    'session.open',
    PairingPeerOpenSessionParamsSchema
)
export const PairingPeerResumeSessionRequestSchema = createPairingPeerRequestSchema(
    'session.resume',
    PairingPeerResumeSessionParamsSchema
)
export const PairingPeerLoadAfterRequestSchema = createPairingPeerRequestSchema(
    'session.load-after',
    PairingPeerLoadAfterParamsSchema
)
export const PairingPeerSendMessageRequestSchema = createPairingPeerRequestSchema(
    'session.send',
    PairingPeerSendMessageParamsSchema
)
export const PairingPeerRuntimeCapabilityRequestSchema = createOptionalPairingPeerRequestSchema(
    'runtime.capabilities',
    RuntimeCapabilityRequestSchema
)
export const PairingPeerAgentAvailabilityRequestSchema = createOptionalPairingPeerRequestSchema(
    'runtime.agent-availability',
    ListAgentAvailabilityRequestSchema
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
export const PairingPeerPathsExistRequestSchema = createPairingPeerRequestSchema(
    'runtime.paths-exists',
    PairingPeerPathsExistParamsSchema
)
export const PairingPeerBrowseDirectoryRequestSchema = createOptionalPairingPeerRequestSchema(
    'runtime.browse-directory',
    PairingPeerBrowseDirectoryParamsSchema
)
export const PairingPeerAgentLaunchConfigRequestSchema = createPairingPeerRequestSchema(
    'runtime.agent-launch-config',
    ResolveAgentLaunchConfigRequestSchema
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
    PairingPeerRuntimeCapabilityRequestSchema,
    PairingPeerAgentAvailabilityRequestSchema,
    PairingPeerAgentConfigRequestSchema,
    PairingPeerSaveAgentConfigRequestSchema,
    PairingPeerRestoreAgentConfigRequestSchema,
    PairingPeerPathsExistRequestSchema,
    PairingPeerBrowseDirectoryRequestSchema,
    PairingPeerAgentLaunchConfigRequestSchema,
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

export const PairingPeerSyncEventSchema = z.object({
    kind: z.literal('event'),
    event: z.literal('sync-event'),
    payload: SyncEventSchema,
})
export const PairingPeerTerminalEventSchema = z.object({
    kind: z.literal('event'),
    event: z.literal('terminal-event'),
    payload: PairingPeerTerminalEventPayloadSchema,
})
export const PairingPeerEventSchema = z.discriminatedUnion('event', [
    PairingPeerSyncEventSchema,
    PairingPeerTerminalEventSchema,
])
export type PairingPeerEvent = z.infer<typeof PairingPeerEventSchema>

export const PairingPeerHeartbeatSchema = z.object({
    kind: z.literal('heartbeat'),
})
export type PairingPeerHeartbeat = z.infer<typeof PairingPeerHeartbeatSchema>

export const PairingPeerMessageSchema = z.union([
    PairingPeerRequestSchema,
    PairingPeerResponseSchema,
    PairingPeerEventSchema,
    PairingPeerHeartbeatSchema,
])
export type PairingPeerMessage = z.infer<typeof PairingPeerMessageSchema>
