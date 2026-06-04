import { z } from 'zod'
import { MessageMetaSchema } from './messageMeta'
import { AgentStateSchema, AttachmentMetadataSchema, MetadataSchema } from './schemas'
import {
    SessionAlivePayloadSchema,
    SessionRuntimeStatePayloadSchema,
    SessionStreamUpdatePayloadSchema,
    TerminalClosePayloadSchema,
    TerminalErrorPayloadSchema,
    TerminalExitPayloadSchema,
    TerminalOpenPayloadSchema,
    TerminalOutputPayloadSchema,
    TerminalReadyPayloadSchema,
    TerminalResizePayloadSchema,
    TerminalWritePayloadSchema,
} from './socket'

export const PROVIDER_ADAPTER_EVENTS_STDOUT_ENV = 'VIBY_PROVIDER_ADAPTER_EVENTS_STDOUT'
export const PROVIDER_ADAPTER_EVENT_SESSION_STARTED = 'runtime.session-started'
export const PROVIDER_ADAPTER_INPUT_SESSION_MESSAGE = 'runtime.session-message'
export const PROVIDER_ADAPTER_INPUT_CANCEL_MESSAGES = 'runtime.cancel-messages'
export const PROVIDER_ADAPTER_INPUT_RPC_REQUEST = 'runtime.rpc-request'
export const PROVIDER_ADAPTER_INPUT_METADATA_RESULT = 'runtime.metadata-result'
export const PROVIDER_ADAPTER_INPUT_AGENT_STATE_RESULT = 'runtime.agent-state-result'
export const PROVIDER_ADAPTER_INPUT_TERMINAL = 'runtime.terminal-input'

const RequestIdSchema = z.string().min(1)
const SessionIdSchema = z.string().min(1)
const NonEmptyStringArraySchema = z.array(z.string().min(1)).min(1)

const RuntimeUserTextMessageSchema = z
    .object({
        role: z.literal('user'),
        content: z
            .object({
                type: z.literal('text'),
                text: z.string(),
                attachments: z.array(AttachmentMetadataSchema).optional(),
            })
            .strict(),
        localKey: z.string().optional(),
        meta: MessageMetaSchema.optional(),
    })
    .strict()

const RuntimeAgentMessageSchema = z
    .object({
        role: z.literal('agent'),
        content: z.discriminatedUnion('type', [
            z.object({ type: z.literal('output'), data: z.unknown() }).strict(),
            z.object({ type: z.literal('codex'), data: z.unknown() }).strict(),
            z.object({ type: z.literal('event'), id: z.string().min(1), data: z.unknown() }).strict(),
        ]),
        meta: MessageMetaSchema.optional(),
    })
    .strict()

export const RuntimeMessageContentSchema = z.discriminatedUnion('role', [
    RuntimeUserTextMessageSchema,
    RuntimeAgentMessageSchema,
])

const ProviderAdapterSuccessResultSchema = z
    .object({
        requestId: RequestIdSchema,
        result: z.literal('success'),
        version: z.number().int(),
        value: z.unknown().optional(),
    })
    .strict()
    .superRefine(requireValueField)

const ProviderAdapterVersionMismatchResultSchema = z
    .object({
        requestId: RequestIdSchema,
        result: z.literal('version-mismatch'),
        version: z.number().int(),
        value: z.unknown().optional(),
    })
    .strict()
    .superRefine(requireValueField)

const ProviderAdapterErrorResultSchema = z
    .object({
        requestId: RequestIdSchema,
        result: z.literal('error'),
        error: z.string().min(1),
    })
    .strict()

function createRequestResultSchema(
    type: typeof PROVIDER_ADAPTER_INPUT_METADATA_RESULT | typeof PROVIDER_ADAPTER_INPUT_AGENT_STATE_RESULT
) {
    return z.union([
        ProviderAdapterSuccessResultSchema.extend({ type: z.literal(type) }),
        ProviderAdapterVersionMismatchResultSchema.extend({ type: z.literal(type) }),
        ProviderAdapterErrorResultSchema.extend({ type: z.literal(type) }),
    ])
}

const MetadataRequestResultSchema = createRequestResultSchema(PROVIDER_ADAPTER_INPUT_METADATA_RESULT)
const AgentStateRequestResultSchema = createRequestResultSchema(PROVIDER_ADAPTER_INPUT_AGENT_STATE_RESULT)

export const ProviderAdapterInputSchema = z.union([
    z
        .object({
            type: z.literal(PROVIDER_ADAPTER_INPUT_SESSION_MESSAGE),
            sessionId: SessionIdSchema,
            message: z.object({
                seq: z.number().nullable().optional(),
                localId: z.string().nullable().optional(),
                content: z.unknown(),
            }),
        })
        .strict(),
    z
        .object({
            type: z.literal(PROVIDER_ADAPTER_INPUT_CANCEL_MESSAGES),
            sessionId: SessionIdSchema,
            localIds: NonEmptyStringArraySchema,
        })
        .strict(),
    z
        .object({
            type: z.literal(PROVIDER_ADAPTER_INPUT_RPC_REQUEST),
            requestId: RequestIdSchema,
            method: z.string().min(1),
            params: z.unknown(),
        })
        .strict(),
    MetadataRequestResultSchema,
    AgentStateRequestResultSchema,
    z
        .object({
            type: z.literal(PROVIDER_ADAPTER_INPUT_TERMINAL),
            event: z.discriminatedUnion('type', [
                TerminalOpenPayloadSchema.extend({ type: z.literal('open') }),
                TerminalWritePayloadSchema.extend({ type: z.literal('write') }),
                TerminalResizePayloadSchema.extend({ type: z.literal('resize') }),
                TerminalClosePayloadSchema.extend({ type: z.literal('close') }),
            ]),
        })
        .strict(),
])

export const ProviderAdapterRuntimeEventSchema = z.discriminatedUnion('type', [
    z
        .object({
            type: z.literal(PROVIDER_ADAPTER_EVENT_SESSION_STARTED),
            sessionId: SessionIdSchema,
            metadata: MetadataSchema,
        })
        .strict(),
    z
        .object({
            type: z.literal('runtime.message'),
            sessionId: SessionIdSchema,
            message: RuntimeMessageContentSchema,
            localId: z.string().optional(),
        })
        .strict(),
    z.object({ type: z.literal('runtime.stream-update'), update: SessionStreamUpdatePayloadSchema }).strict(),
    z
        .object({
            type: z.literal('runtime.messages-consumed'),
            sessionId: SessionIdSchema,
            localIds: NonEmptyStringArraySchema,
        })
        .strict(),
    z
        .object({
            type: z.literal('runtime.messages-canceled'),
            sessionId: SessionIdSchema,
            localIds: NonEmptyStringArraySchema,
        })
        .strict(),
    z.object({ type: z.literal('runtime.session-alive'), payload: SessionAlivePayloadSchema }).strict(),
    z.object({ type: z.literal('runtime.session-runtime-state'), payload: SessionRuntimeStatePayloadSchema }).strict(),
    z.object({ type: z.literal('runtime.session-end'), sessionId: SessionIdSchema, time: z.number() }).strict(),
    z
        .object({
            type: z.literal('runtime.metadata-update'),
            requestId: RequestIdSchema,
            sessionId: SessionIdSchema,
            expectedVersion: z.number().int(),
            metadata: MetadataSchema,
            touchUpdatedAt: z.boolean().optional(),
        })
        .strict(),
    z
        .object({
            type: z.literal('runtime.agent-state-update'),
            requestId: RequestIdSchema,
            sessionId: SessionIdSchema,
            expectedVersion: z.number().int(),
            agentState: AgentStateSchema.nullable(),
        })
        .strict(),
    z.object({ type: z.literal('runtime.rpc-register'), method: z.string().min(1) }).strict(),
    z.object({ type: z.literal('runtime.rpc-response'), requestId: RequestIdSchema, response: z.unknown() }).strict(),
    z
        .object({
            type: z.literal('runtime.terminal-event'),
            event: z.discriminatedUnion('type', [
                TerminalReadyPayloadSchema.extend({ type: z.literal('ready') }),
                TerminalOutputPayloadSchema.extend({ type: z.literal('output') }),
                TerminalExitPayloadSchema.extend({ type: z.literal('exit') }),
                TerminalErrorPayloadSchema.extend({ type: z.literal('error') }),
            ]),
        })
        .strict(),
    z.object({ type: z.literal('runtime.command-capabilities-invalidated'), sessionId: SessionIdSchema }).strict(),
])

export type ProviderAdapterInput = z.infer<typeof ProviderAdapterInputSchema>
export type ProviderAdapterRuntimeEvent = z.infer<typeof ProviderAdapterRuntimeEventSchema>
export type ProviderAdapterSessionStartedEvent = Extract<
    ProviderAdapterRuntimeEvent,
    { type: typeof PROVIDER_ADAPTER_EVENT_SESSION_STARTED }
>

export type ProviderAdapterParseResult<T> = { ok: true; value: T } | { ok: false; error: string }

export function serializeProviderAdapterInput(input: ProviderAdapterInput): string {
    return `${JSON.stringify(input)}\n`
}

export function serializeProviderAdapterEvent(event: ProviderAdapterRuntimeEvent): string {
    return `${JSON.stringify(event)}\n`
}

export function parseProviderAdapterInput(line: string): ProviderAdapterInput | null {
    const result = parseProviderAdapterInputLine(line)
    return result.ok ? result.value : null
}

export function parseProviderAdapterEvent(line: string): ProviderAdapterRuntimeEvent | null {
    const result = parseProviderAdapterEventLine(line)
    return result.ok ? result.value : null
}

export function parseProviderAdapterInputLine(line: string): ProviderAdapterParseResult<ProviderAdapterInput> {
    return parseLine(ProviderAdapterInputSchema, line)
}

export function parseProviderAdapterEventLine(line: string): ProviderAdapterParseResult<ProviderAdapterRuntimeEvent> {
    return parseLine(ProviderAdapterRuntimeEventSchema, line)
}

function parseLine<T>(schema: z.ZodType<T>, line: string): ProviderAdapterParseResult<T> {
    let parsed: unknown
    try {
        parsed = JSON.parse(line)
    } catch {
        return { ok: false, error: 'invalid-json' }
    }
    const result = schema.safeParse(parsed)
    return result.success ? { ok: true, value: result.data } : { ok: false, error: formatZodError(result.error) }
}

function formatZodError(error: z.ZodError): string {
    const issue = error.issues[0]
    if (!issue) return 'schema-mismatch'
    const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''
    return `${path}${issue.message}`
}

function requireValueField(value: { value?: unknown }, context: z.RefinementCtx): void {
    if (Object.prototype.hasOwnProperty.call(value, 'value')) return
    context.addIssue({ code: 'custom', message: 'value is required' })
}
