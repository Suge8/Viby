import { z } from 'zod'
import { CommandCapabilitiesResponseSchema } from '../commandCapabilities'
import { LocalSessionCatalogSchema, LocalSessionExportRequestSchema } from '../localSessions'
import {
    CodexCollaborationModeSchema,
    CodexServiceTierSchema,
    ModelReasoningEffortSchema,
    PermissionModeSchema,
    SessionDriverSchema,
    SessionSchema,
} from '../schemas'
import { createPairingPeerRequestSchema, PairingPeerRequestIdSchema } from './pairingPeerRequestSchemaBase'

export const PairingPeerSessionParamsSchema = z.object({ sessionId: z.string().min(1) })
export type PairingPeerSessionParams = z.infer<typeof PairingPeerSessionParamsSchema>

export const PairingPeerRenameSessionParamsSchema = PairingPeerSessionParamsSchema.extend({ name: z.string().min(1) })
export type PairingPeerRenameSessionParams = z.infer<typeof PairingPeerRenameSessionParamsSchema>

export const PairingPeerDriverSwitchParamsSchema = PairingPeerSessionParamsSchema.extend({
    targetDriver: SessionDriverSchema,
})
export type PairingPeerDriverSwitchParams = z.infer<typeof PairingPeerDriverSwitchParamsSchema>

export const PairingPeerPermissionModeParamsSchema = PairingPeerSessionParamsSchema.extend({
    mode: PermissionModeSchema,
})
export type PairingPeerPermissionModeParams = z.infer<typeof PairingPeerPermissionModeParamsSchema>

export const PairingPeerCollaborationModeParamsSchema = PairingPeerSessionParamsSchema.extend({
    mode: CodexCollaborationModeSchema,
})
export type PairingPeerCollaborationModeParams = z.infer<typeof PairingPeerCollaborationModeParamsSchema>

export const PairingPeerModelParamsSchema = PairingPeerSessionParamsSchema.extend({
    model: z.string().min(1).nullable(),
})
export type PairingPeerModelParams = z.infer<typeof PairingPeerModelParamsSchema>

export const PairingPeerModelReasoningEffortParamsSchema = PairingPeerSessionParamsSchema.extend({
    modelReasoningEffort: ModelReasoningEffortSchema.nullable(),
})
export type PairingPeerModelReasoningEffortParams = z.infer<typeof PairingPeerModelReasoningEffortParamsSchema>

export const PairingPeerCodexServiceTierParamsSchema = PairingPeerSessionParamsSchema.extend({
    codexServiceTier: CodexServiceTierSchema.nullable(),
})
export type PairingPeerCodexServiceTierParams = z.infer<typeof PairingPeerCodexServiceTierParamsSchema>

export const PairingPeerCommandCapabilitiesParamsSchema = PairingPeerSessionParamsSchema.extend({
    revision: z.string().min(1).optional(),
})
export type PairingPeerCommandCapabilitiesParams = z.infer<typeof PairingPeerCommandCapabilitiesParamsSchema>

const PairingPeerPermissionDecisionSchema = z.enum(['approved', 'approved_for_session', 'denied', 'abort'])

export const PairingPeerApprovePermissionParamsSchema = PairingPeerSessionParamsSchema.extend({
    requestId: z.string().min(1),
    mode: PermissionModeSchema.optional(),
    allowTools: z.array(z.string()).optional(),
    decision: PairingPeerPermissionDecisionSchema.optional(),
    answers: z.unknown().optional(),
})
export type PairingPeerApprovePermissionParams = z.infer<typeof PairingPeerApprovePermissionParamsSchema>

export const PairingPeerDenyPermissionParamsSchema = PairingPeerSessionParamsSchema.extend({
    requestId: z.string().min(1),
    decision: PairingPeerPermissionDecisionSchema.optional(),
})
export type PairingPeerDenyPermissionParams = z.infer<typeof PairingPeerDenyPermissionParamsSchema>

export const PairingPeerGitDiffNumstatParamsSchema = PairingPeerSessionParamsSchema.extend({ staged: z.boolean() })
export type PairingPeerGitDiffNumstatParams = z.infer<typeof PairingPeerGitDiffNumstatParamsSchema>

export const PairingPeerGitDiffFileParamsSchema = PairingPeerSessionParamsSchema.extend({
    path: z.string().min(1),
    staged: z.boolean().optional(),
})
export type PairingPeerGitDiffFileParams = z.infer<typeof PairingPeerGitDiffFileParamsSchema>

export const PairingPeerSearchFilesParamsSchema = PairingPeerSessionParamsSchema.extend({
    query: z.string(),
    limit: z.number().int().positive().max(500).optional(),
})
export type PairingPeerSearchFilesParams = z.infer<typeof PairingPeerSearchFilesParamsSchema>

export const PairingPeerFilePathParamsSchema = PairingPeerSessionParamsSchema.extend({ path: z.string().min(1) })
export type PairingPeerFilePathParams = z.infer<typeof PairingPeerFilePathParamsSchema>

export const PairingPeerListDirectoryParamsSchema = PairingPeerSessionParamsSchema.extend({
    path: z.string().optional(),
})
export type PairingPeerListDirectoryParams = z.infer<typeof PairingPeerListDirectoryParamsSchema>

export const PairingPeerSessionResultSchema = z.object({ session: SessionSchema })
export type PairingPeerSessionResult = z.infer<typeof PairingPeerSessionResultSchema>

export const PairingPeerOkResultSchema = z.object({ ok: z.literal(true) })
export type PairingPeerOkResult = z.infer<typeof PairingPeerOkResultSchema>

export const PairingPeerRuntimeLocalSessionsResultSchema = LocalSessionCatalogSchema
export type PairingPeerRuntimeLocalSessionsResult = z.infer<typeof PairingPeerRuntimeLocalSessionsResultSchema>

export const PairingPeerImportLocalSessionResultSchema = z.object({ session: SessionSchema, imported: z.boolean() })
export type PairingPeerImportLocalSessionResult = z.infer<typeof PairingPeerImportLocalSessionResultSchema>

export const PairingPeerGitCommandResultSchema = z.object({
    success: z.boolean(),
    stdout: z.string().optional(),
    stderr: z.string().optional(),
    exitCode: z.number().optional(),
    error: z.string().optional(),
})
export type PairingPeerGitCommandResult = z.infer<typeof PairingPeerGitCommandResultSchema>

export const PairingPeerFileSearchResultSchema = z.object({
    success: z.boolean(),
    files: z
        .array(
            z.object({
                fileName: z.string(),
                filePath: z.string(),
                fullPath: z.string(),
                fileType: z.enum(['file', 'folder']),
            })
        )
        .optional(),
    error: z.string().optional(),
})
export type PairingPeerFileSearchResult = z.infer<typeof PairingPeerFileSearchResultSchema>

export const PairingPeerFileReadResultSchema = z.object({
    success: z.boolean(),
    content: z.string().optional(),
    error: z.string().optional(),
})
export type PairingPeerFileReadResult = z.infer<typeof PairingPeerFileReadResultSchema>

export const PairingPeerListDirectoryResultSchema = z.object({
    success: z.boolean(),
    entries: z
        .array(
            z.object({
                name: z.string(),
                type: z.enum(['file', 'directory', 'other']),
                size: z.number().optional(),
                modified: z.number().optional(),
            })
        )
        .optional(),
    error: z.string().optional(),
})
export type PairingPeerListDirectoryResult = z.infer<typeof PairingPeerListDirectoryResultSchema>

export const PairingPeerDeleteUploadResultSchema = z.object({ success: z.boolean(), error: z.string().optional() })
export type PairingPeerDeleteUploadResult = z.infer<typeof PairingPeerDeleteUploadResultSchema>

export const PairingPeerCommandCapabilitiesResultSchema = CommandCapabilitiesResponseSchema
export type PairingPeerCommandCapabilitiesResult = z.infer<typeof PairingPeerCommandCapabilitiesResultSchema>

export const PairingPeerAbortSessionRequestSchema = createPairingPeerRequestSchema(
    'session.abort',
    PairingPeerSessionParamsSchema
)
export const PairingPeerArchiveSessionRequestSchema = createPairingPeerRequestSchema(
    'session.archive',
    PairingPeerSessionParamsSchema
)
export const PairingPeerCloseSessionRequestSchema = createPairingPeerRequestSchema(
    'session.close',
    PairingPeerSessionParamsSchema
)
export const PairingPeerUnarchiveSessionRequestSchema = createPairingPeerRequestSchema(
    'session.unarchive',
    PairingPeerSessionParamsSchema
)
export const PairingPeerRenameSessionRequestSchema = createPairingPeerRequestSchema(
    'session.rename',
    PairingPeerRenameSessionParamsSchema
)
export const PairingPeerDeleteSessionRequestSchema = createPairingPeerRequestSchema(
    'session.delete',
    PairingPeerSessionParamsSchema
)
export const PairingPeerDriverSwitchRequestSchema = createPairingPeerRequestSchema(
    'session.driver-switch',
    PairingPeerDriverSwitchParamsSchema
)
export const PairingPeerPermissionModeRequestSchema = createPairingPeerRequestSchema(
    'session.permission-mode',
    PairingPeerPermissionModeParamsSchema
)
export const PairingPeerCollaborationModeRequestSchema = createPairingPeerRequestSchema(
    'session.collaboration-mode',
    PairingPeerCollaborationModeParamsSchema
)
export const PairingPeerModelRequestSchema = createPairingPeerRequestSchema(
    'session.model',
    PairingPeerModelParamsSchema
)
export const PairingPeerModelReasoningEffortRequestSchema = createPairingPeerRequestSchema(
    'session.model-reasoning-effort',
    PairingPeerModelReasoningEffortParamsSchema
)
export const PairingPeerCodexServiceTierRequestSchema = createPairingPeerRequestSchema(
    'session.codex-service-tier',
    PairingPeerCodexServiceTierParamsSchema
)
export const PairingPeerCommandCapabilitiesRequestSchema = createPairingPeerRequestSchema(
    'session.command-capabilities',
    PairingPeerCommandCapabilitiesParamsSchema
)
export const PairingPeerApprovePermissionRequestSchema = createPairingPeerRequestSchema(
    'permission.approve',
    PairingPeerApprovePermissionParamsSchema
)
export const PairingPeerDenyPermissionRequestSchema = createPairingPeerRequestSchema(
    'permission.deny',
    PairingPeerDenyPermissionParamsSchema
)

export const PairingPeerRuntimeLocalSessionsRequestSchema = z.object({
    kind: z.literal('request'),
    id: PairingPeerRequestIdSchema,
    method: z.literal('runtime.local-sessions'),
    params: LocalSessionExportRequestSchema.pick({ path: true, driver: true }),
})
export const PairingPeerImportLocalSessionRequestSchema = z.object({
    kind: z.literal('request'),
    id: PairingPeerRequestIdSchema,
    method: z.literal('runtime.import-local-session'),
    params: LocalSessionExportRequestSchema,
})
export const PairingPeerGitStatusRequestSchema = createPairingPeerRequestSchema(
    'workspace.git-status',
    PairingPeerSessionParamsSchema
)
export const PairingPeerGitDiffNumstatRequestSchema = createPairingPeerRequestSchema(
    'workspace.git-diff-numstat',
    PairingPeerGitDiffNumstatParamsSchema
)
export const PairingPeerGitDiffFileRequestSchema = createPairingPeerRequestSchema(
    'workspace.git-diff-file',
    PairingPeerGitDiffFileParamsSchema
)
export const PairingPeerSearchFilesRequestSchema = createPairingPeerRequestSchema(
    'workspace.search-files',
    PairingPeerSearchFilesParamsSchema
)
export const PairingPeerReadFileRequestSchema = createPairingPeerRequestSchema(
    'workspace.read-file',
    PairingPeerFilePathParamsSchema
)
export const PairingPeerListDirectoryRequestSchema = createPairingPeerRequestSchema(
    'workspace.list-directory',
    PairingPeerListDirectoryParamsSchema
)
export const PairingPeerDeleteUploadRequestSchema = createPairingPeerRequestSchema(
    'session.delete-upload',
    PairingPeerFilePathParamsSchema
)
