import { z } from 'zod'
import type { PermissionMode } from './modes'
import { PermissionModeSchema } from './schemas'

export const AssistantErrorEventSchema = z.object({
    type: z.literal('assistant-error'),
    detail: z.string().optional(),
})

export const MessageEventSchema = z.object({
    type: z.literal('message'),
    message: z.string(),
})

export const ReadyEventSchema = z.object({ type: z.literal('ready') })

export const TurnTerminalEventSchema = z.object({
    type: z.literal('turn-terminal'),
    status: z.enum(['completed', 'truncated', 'aborted', 'failed', 'needs-input']),
    provider: z.string().optional(),
    reason: z.string().optional(),
    assistantTurnId: z.string().optional(),
})

export const PermissionModeChangedEventSchema = z.object({
    type: z.literal('permission-mode-changed'),
    mode: PermissionModeSchema,
})

export const DriverSwitchSendFailedEventSchema = z.object({
    type: z.literal('driver-switch-send-failed'),
    stage: z.enum(['runtime_update', 'callback_flush']).optional(),
    code: z.enum(['empty_first_turn', 'timeout', 'unknown']).optional(),
})

export const ApiErrorEventSchema = z.object({
    type: z.literal('api-error'),
    retryAttempt: z.number(),
    maxRetries: z.number(),
    error: z.unknown().optional(),
})

export const SessionAgentKnownEventSchema = z.discriminatedUnion('type', [
    AssistantErrorEventSchema,
    MessageEventSchema,
    ReadyEventSchema,
    TurnTerminalEventSchema,
    PermissionModeChangedEventSchema,
    DriverSwitchSendFailedEventSchema,
    ApiErrorEventSchema,
])

export type AssistantErrorEvent = z.infer<typeof AssistantErrorEventSchema>
export type MessageEvent = z.infer<typeof MessageEventSchema>
export type ReadyEvent = z.infer<typeof ReadyEventSchema>
export type TurnTerminalEvent = z.infer<typeof TurnTerminalEventSchema>
export type PermissionModeChangedEvent = {
    type: 'permission-mode-changed'
    mode: PermissionMode
}
export type DriverSwitchSendFailedEvent = z.infer<typeof DriverSwitchSendFailedEventSchema>
export type ApiErrorEvent = z.infer<typeof ApiErrorEventSchema>

export type SessionAgentEvent =
    | AssistantErrorEvent
    | MessageEvent
    | ReadyEvent
    | TurnTerminalEvent
    | PermissionModeChangedEvent
    | DriverSwitchSendFailedEvent
    | ApiErrorEvent
    | { type: 'driver-switched'; previousDriver?: string; targetDriver?: string }
    | { type: 'limit-reached'; endsAt: number; limitType?: string }
    | { type: 'limit-warning'; endsAt: number; percent: number; limitType?: string }
    | { type: 'turn-duration'; durationMs: number }
    | { type: 'microcompact'; trigger: string; preTokens: number; tokensSaved: number }
    | { type: 'compact'; trigger: string; preTokens: number }
    | ({ type: string } & Record<string, unknown>)

export type RuntimeSessionEventPayload =
    | MessageEvent
    | AssistantErrorEvent
    | PermissionModeChangedEvent
    | DriverSwitchSendFailedEvent
    | ReadyEvent
    | TurnTerminalEvent
