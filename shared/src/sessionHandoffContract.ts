import { z } from 'zod'
import {
    AttachmentMetadataSchema,
    CodexCollaborationModeSchema,
    ModelReasoningEffortSchema,
    PermissionModeSchema,
    SessionDriverSchema,
} from './schemas'

const SESSION_HANDOFF_ERROR_CODE_VALUES = [
    'session_metadata_missing',
    'working_directory_missing',
    'driver_context_missing',
    'transcript_message_invalid',
    'attachment_payload_invalid',
] as const

export const SessionHandoffContractErrorCodeSchema = z.enum(SESSION_HANDOFF_ERROR_CODE_VALUES)
export type SessionHandoffContractErrorCode = z.infer<typeof SessionHandoffContractErrorCodeSchema>

export const SessionHandoffAttachmentSchema = AttachmentMetadataSchema.pick({
    filename: true,
    mimeType: true,
    path: true,
    size: true,
})
export type SessionHandoffAttachment = z.infer<typeof SessionHandoffAttachmentSchema>

export const SessionHandoffMessageSchema = z.object({
    id: z.string(),
    seq: z.number().nullable(),
    createdAt: z.number(),
    role: z.enum(['user', 'assistant']),
    text: z.string(),
    attachmentPaths: z.array(z.string()).optional(),
})
export type SessionHandoffMessage = z.infer<typeof SessionHandoffMessageSchema>

export const SessionHandoffLiveConfigSchema = z.object({
    model: z.string().nullable(),
    modelReasoningEffort: ModelReasoningEffortSchema.nullable(),
    permissionMode: PermissionModeSchema.nullish(),
    collaborationMode: CodexCollaborationModeSchema.nullish(),
})
export type SessionHandoffLiveConfig = z.infer<typeof SessionHandoffLiveConfigSchema>

export const SessionHandoffSnapshotSchema = z.object({
    driver: SessionDriverSchema,
    workingDirectory: z.string(),
    liveConfig: SessionHandoffLiveConfigSchema,
    history: z.array(SessionHandoffMessageSchema),
    attachments: z.array(SessionHandoffAttachmentSchema),
})
export type SessionHandoffSnapshot = z.infer<typeof SessionHandoffSnapshotSchema>

export class SessionHandoffContractError extends Error {
    readonly code: SessionHandoffContractErrorCode
    readonly field: string

    constructor(code: SessionHandoffContractErrorCode, field: string) {
        super(`Invalid session handoff contract (${code}) at ${field}.`)
        this.name = 'SessionHandoffContractError'
        this.code = code
        this.field = field
    }
}
