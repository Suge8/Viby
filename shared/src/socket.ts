import { z } from 'zod'
import {
    CODEX_COLLABORATION_MODES,
    CODEX_SERVICE_TIERS,
    type CodexCollaborationMode,
    type CodexServiceTier,
    MODEL_REASONING_EFFORTS,
    type ModelReasoningEffort,
    PERMISSION_MODES,
    type PermissionMode,
} from './modes'
import type {
    TerminalClosePayload,
    TerminalErrorPayload,
    TerminalExitPayload,
    TerminalOpenPayload,
    TerminalOutputPayload,
    TerminalReadyPayload,
    TerminalResizePayload,
    TerminalWritePayload,
} from './terminalPayloads'

export * from './terminalPayloads'

export type SocketErrorReason = 'not-found'

export const SessionStreamAppendPayloadSchema = z.object({
    sid: z.string().min(1),
    kind: z.literal('append'),
    assistantTurnId: z.string().min(1),
    delta: z.string().min(1),
})

export const SessionStreamClearPayloadSchema = z.object({
    sid: z.string().min(1),
    kind: z.literal('clear'),
    assistantTurnId: z.string().min(1).optional(),
})

export const SessionStreamUpdatePayloadSchema = z.discriminatedUnion('kind', [
    SessionStreamAppendPayloadSchema,
    SessionStreamClearPayloadSchema,
])

export type SessionStreamUpdatePayload = z.infer<typeof SessionStreamUpdatePayloadSchema>

export const WebSubscriptionSchema = z
    .object({
        all: z.boolean().optional(),
        sessionId: z.string().min(1).optional(),
        machineId: z.string().min(1).optional(),
        pushEndpoint: z.string().min(1).optional(),
    })
    .refine((value) => value.all === true || Boolean(value.sessionId) || Boolean(value.machineId), {
        message: 'At least one realtime scope is required',
    })

export type WebSubscription = z.infer<typeof WebSubscriptionSchema>

export const WebVisibilityStateSchema = z.enum(['visible', 'hidden'])

export type WebVisibilityState = z.infer<typeof WebVisibilityStateSchema>

export const UpdateNewMessageBodySchema = z.object({
    t: z.literal('new-message'),
    sid: z.string(),
    message: z.object({
        id: z.string(),
        seq: z.number(),
        createdAt: z.number(),
        localId: z.string().nullable().optional(),
        invokedAt: z.number().nullable().optional(),
        content: z.unknown(),
    }),
})

export type UpdateNewMessageBody = z.infer<typeof UpdateNewMessageBodySchema>

export const UpdateCancelMessagesBodySchema = z.object({
    t: z.literal('cancel-messages'),
    sid: z.string(),
    localIds: z.array(z.string()),
})

export type UpdateCancelMessagesBody = z.infer<typeof UpdateCancelMessagesBodySchema>

export const SessionAlivePayloadSchema = z.object({
    sid: z.string().min(1),
    time: z.number(),
    thinking: z.boolean(),
    mode: z.enum(['local', 'remote']).optional(),
    permissionMode: z.enum(PERMISSION_MODES).optional(),
    model: z.string().nullable().optional(),
    modelReasoningEffort: z.enum(MODEL_REASONING_EFFORTS).nullable().optional(),
    codexServiceTier: z.enum(CODEX_SERVICE_TIERS).nullable().optional(),
    collaborationMode: z.enum(CODEX_COLLABORATION_MODES).optional(),
})

export type SessionAlivePayload = z.infer<typeof SessionAlivePayloadSchema>

export const SessionRuntimeStatePayloadSchema = z.object({
    sid: z.string().min(1),
    time: z.number(),
    state: z.literal('stopping'),
    reason: z.enum(['idle-timeout', 'user-request', 'shutdown']).optional(),
})

export type SessionRuntimeStatePayload = z.infer<typeof SessionRuntimeStatePayloadSchema>

export const UpdateSessionBodySchema = z.object({
    t: z.literal('update-session'),
    sid: z.string(),
    metadata: z
        .object({
            version: z.number(),
            value: z.unknown(),
        })
        .nullable(),
    agentState: z
        .object({
            version: z.number(),
            value: z.unknown().nullable(),
        })
        .nullable(),
})

export type UpdateSessionBody = z.infer<typeof UpdateSessionBodySchema>

export const UpdateMachineBodySchema = z.object({
    t: z.literal('update-machine'),
    machineId: z.string(),
    metadata: z
        .object({
            version: z.number(),
            value: z.unknown(),
        })
        .nullable(),
    runtimeState: z
        .object({
            version: z.number(),
            value: z.unknown().nullable(),
        })
        .nullable(),
})

export type UpdateMachineBody = z.infer<typeof UpdateMachineBodySchema>

export const UpdateSchema = z.object({
    id: z.string(),
    seq: z.number(),
    body: z.union([
        UpdateNewMessageBodySchema,
        UpdateCancelMessagesBodySchema,
        UpdateSessionBodySchema,
        UpdateMachineBodySchema,
    ]),
    createdAt: z.number(),
})

export type Update = z.infer<typeof UpdateSchema>

export interface ServerToClientEvents {
    update: (data: Update) => void
    'rpc-request': (data: { method: string; params: string }, callback: (response: string) => void) => void
    'terminal:open': (data: TerminalOpenPayload) => void
    'terminal:write': (data: TerminalWritePayload) => void
    'terminal:resize': (data: TerminalResizePayload) => void
    'terminal:close': (data: TerminalClosePayload) => void
    error: (data: { message: string; code?: SocketErrorReason; scope?: 'session' | 'machine'; id?: string }) => void
}

export interface ClientToServerEvents {
    message: (data: { sid: string; message: unknown; localId?: string }) => void
    'messages-consumed': (data: { sid: string; localIds: string[] }) => void
    'messages-canceled': (data: { sid: string; localIds: string[] }) => void
    'command-capabilities-invalidated': (data: { sid: string }) => void
    'session-alive': (data: SessionAlivePayload) => void
    'session-end': (data: { sid: string; time: number }) => void
    'session-runtime-state': (data: SessionRuntimeStatePayload) => void
    'update-metadata': (
        data: {
            sid: string
            expectedVersion: number
            metadata: unknown
            touchUpdatedAt?: boolean
        },
        cb: (
            answer:
                | {
                      result: 'error'
                      reason?: SocketErrorReason
                  }
                | {
                      result: 'version-mismatch'
                      version: number
                      metadata: unknown | null
                  }
                | {
                      result: 'success'
                      version: number
                      metadata: unknown | null
                  }
        ) => void
    ) => void
    'update-state': (
        data: { sid: string; expectedVersion: number; agentState: unknown | null },
        cb: (
            answer:
                | {
                      result: 'error'
                      reason?: SocketErrorReason
                  }
                | {
                      result: 'version-mismatch'
                      version: number
                      agentState: unknown | null
                  }
                | {
                      result: 'success'
                      version: number
                      agentState: unknown | null
                  }
        ) => void
    ) => void
    'machine-alive': (data: { machineId: string; time: number }) => void
    'machine-update-metadata': (
        data: { machineId: string; expectedVersion: number; metadata: unknown },
        cb: (
            answer:
                | {
                      result: 'error'
                      reason?: SocketErrorReason
                  }
                | {
                      result: 'version-mismatch'
                      version: number
                      metadata: unknown | null
                  }
                | {
                      result: 'success'
                      version: number
                      metadata: unknown | null
                  }
        ) => void
    ) => void
    'machine-update-state': (
        data: { machineId: string; expectedVersion: number; runtimeState: unknown | null },
        cb: (
            answer:
                | {
                      result: 'error'
                      reason?: SocketErrorReason
                  }
                | {
                      result: 'version-mismatch'
                      version: number
                      runtimeState: unknown | null
                  }
                | {
                      result: 'success'
                      version: number
                      runtimeState: unknown | null
                  }
        ) => void
    ) => void
    'rpc-register': (data: { method: string }) => void
    'rpc-unregister': (data: { method: string }) => void
    'terminal:ready': (data: TerminalReadyPayload) => void
    'terminal:output': (data: TerminalOutputPayload) => void
    'terminal:exit': (data: TerminalExitPayload) => void
    'terminal:error': (data: TerminalErrorPayload) => void
    'stream-update': (data: SessionStreamUpdatePayload) => void
    ping: (callback: () => void) => void
    'usage-report': (data: unknown) => void
}
