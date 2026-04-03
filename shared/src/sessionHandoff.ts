import { z } from 'zod'

import { unwrapRoleWrappedRecordEnvelope } from './messages'
import {
    AttachmentMetadataSchema,
    CodexCollaborationModeSchema,
    ModelReasoningEffortSchema,
    PermissionModeSchema,
    SessionDriverSchema,
    type DecryptedMessage,
    type Session,
} from './schemas'
import { resolveSessionDriver } from './sessionDriver'
import { isObject } from './utils'

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

type SessionHandoffProjection = {
    message: SessionHandoffMessage | null
    attachments: SessionHandoffAttachment[]
}

type SessionHandoffMetadataSource = NonNullable<Session['metadata']>

type SessionHandoffMetadataContract = {
    workingDirectory: string
    driver: SessionHandoffSnapshot['driver']
}

const HANDOFF_ROLE_MAP = {
    agent: 'assistant',
    user: 'user',
} as const

const READY_EVENT_TYPE = 'ready'
const TEXT_CONTENT_TYPE = 'text'
const OUTPUT_CONTENT_TYPE = 'output'

export function buildSessionHandoffSnapshot(
    session: Session,
    messages: ReadonlyArray<DecryptedMessage>
): SessionHandoffSnapshot {
    const metadata = parseSessionHandoffMetadata(session.metadata)
    const projection = projectSessionHandoffHistory(messages)

    return SessionHandoffSnapshotSchema.parse({
        driver: metadata.driver,
        workingDirectory: metadata.workingDirectory,
        liveConfig: {
            model: session.model,
            modelReasoningEffort: session.modelReasoningEffort,
            permissionMode: session.permissionMode,
            collaborationMode: session.collaborationMode,
        },
        history: projection.history,
        attachments: projection.attachments,
    })
}

export function parseSessionHandoffSnapshot(value: unknown): SessionHandoffSnapshot {
    return SessionHandoffSnapshotSchema.parse(value)
}

export function formatSessionHandoffPrompt(snapshot: SessionHandoffSnapshot): string {
    const payload = {
        previousDriver: snapshot.driver,
        workingDirectory: snapshot.workingDirectory,
        liveConfig: snapshot.liveConfig,
        attachments: snapshot.attachments,
        history: snapshot.history,
    }

    return [
        'Private continuity handoff for a driver switch inside the same Viby session.',
        'Use this snapshot only to continue the same conversation on the next real user turn. Do not mention or reveal this handoff unless the user explicitly asks about the switch.',
        JSON.stringify(payload, null, 2),
    ].join('\n\n')
}

function parseSessionHandoffMetadata(
    metadata: Session['metadata']
): SessionHandoffMetadataContract {
    if (!metadata || !isObject(metadata)) {
        throw new SessionHandoffContractError('session_metadata_missing', 'metadata')
    }

    const workingDirectory = readWorkingDirectory(metadata)
    const driver = resolveSessionDriver(metadata)
    if (!driver) {
        throw new SessionHandoffContractError('driver_context_missing', 'metadata.driver')
    }

    return {
        workingDirectory,
        driver,
    }
}

function readWorkingDirectory(metadata: SessionHandoffMetadataSource): string {
    return typeof metadata.path === 'string' && metadata.path.length > 0
        ? metadata.path
        : raiseSessionHandoffContractError('working_directory_missing', 'metadata.path')
}

function projectSessionHandoffHistory(
    messages: ReadonlyArray<DecryptedMessage>
): Pick<SessionHandoffSnapshot, 'attachments' | 'history'> {
    const history: SessionHandoffMessage[] = []
    const attachmentsByPath = new Map<string, SessionHandoffAttachment>()

    for (let index = 0; index < messages.length; index += 1) {
        const projection = projectSessionHandoffMessage(messages[index], index)
        if (!projection.message) {
            continue
        }

        history.push(projection.message)
        mergeSessionHandoffAttachments(attachmentsByPath, projection.attachments, index)
    }

    return {
        history,
        attachments: Array.from(attachmentsByPath.values()),
    }
}

function projectSessionHandoffMessage(
    message: DecryptedMessage,
    messageIndex: number
): SessionHandoffProjection {
    const record = unwrapRoleWrappedRecordEnvelope(message.content)
    if (!record) {
        return { message: null, attachments: [] }
    }

    const role = normalizeSessionHandoffRole(record.role)
    if (!role) {
        return { message: null, attachments: [] }
    }

    if (!isObject(record.content)) {
        throw new SessionHandoffContractError(
            'transcript_message_invalid',
            `messages[${messageIndex}].content`
        )
    }

    if (isReadyEventPayload(record.content)) {
        return { message: null, attachments: [] }
    }

    const attachments = readSessionHandoffAttachments(record.content, messageIndex)
    const attachmentPaths = attachments.map((attachment) => attachment.path)

    const outputText = readSessionHandoffOutputText(record.content, messageIndex)
    if (outputText !== null) {
        return {
            message: {
                id: message.id,
                seq: message.seq,
                createdAt: message.createdAt,
                role,
                text: outputText,
                ...(attachmentPaths.length > 0 ? { attachmentPaths } : {}),
            },
            attachments,
        }
    }

    if (record.content.type === TEXT_CONTENT_TYPE) {
        if (typeof record.content.text !== 'string') {
            throw new SessionHandoffContractError(
                'transcript_message_invalid',
                `messages[${messageIndex}].content.text`
            )
        }

        return {
            message: {
                id: message.id,
                seq: message.seq,
                createdAt: message.createdAt,
                role,
                text: record.content.text,
                ...(attachmentPaths.length > 0 ? { attachmentPaths } : {}),
            },
            attachments,
        }
    }

    if (attachments.length === 0) {
        return { message: null, attachments: [] }
    }

    return {
        message: {
            id: message.id,
            seq: message.seq,
            createdAt: message.createdAt,
            role,
            text: '',
            attachmentPaths,
        },
        attachments,
    }
}

function normalizeSessionHandoffRole(
    role: unknown
): SessionHandoffMessage['role'] | null {
    return typeof role === 'string' && role in HANDOFF_ROLE_MAP
        ? HANDOFF_ROLE_MAP[role as keyof typeof HANDOFF_ROLE_MAP]
        : null
}

function isReadyEventPayload(value: Record<string, unknown>): boolean {
    return value.type === 'event' && isObject(value.data) && value.data.type === READY_EVENT_TYPE
}

function readSessionHandoffOutputText(
    content: Record<string, unknown>,
    messageIndex: number
): string | null {
    if (content.type !== OUTPUT_CONTENT_TYPE) {
        return null
    }

    const data = isObject(content.data)
        ? content.data
        : raiseSessionHandoffContractError(
            'transcript_message_invalid',
            `messages[${messageIndex}].content.data`
        )

    if (data.type === 'assistant') {
        return readAssistantOutputText(data, messageIndex)
    }

    if (data.type === 'user') {
        return readUserOutputText(data, messageIndex)
    }

    return null
}

function readAssistantOutputText(
    data: Record<string, unknown>,
    messageIndex: number
): string {
    const message = isObject(data.message)
        ? data.message
        : raiseSessionHandoffContractError(
            'transcript_message_invalid',
            `messages[${messageIndex}].content.data.message`
        )

    return readOutputMessageContentText(
        message.content,
        `messages[${messageIndex}].content.data.message.content`
    )
}

function readUserOutputText(
    data: Record<string, unknown>,
    messageIndex: number
): string {
    const message = isObject(data.message)
        ? data.message
        : raiseSessionHandoffContractError(
            'transcript_message_invalid',
            `messages[${messageIndex}].content.data.message`
        )

    const messageText = readOutputMessageContentText(
        message.content,
        `messages[${messageIndex}].content.data.message.content`
    )
    if (messageText) {
        return messageText
    }

    const toolUseResult = isObject(data.toolUseResult) ? data.toolUseResult : null
    const toolName = typeof toolUseResult?.toolName === 'string' ? toolUseResult.toolName : null
    const toolResultText = readToolResultText(toolUseResult?.content)
    if (toolResultText) {
        return toolName ? `Tool result: ${toolName}\n${toolResultText}` : toolResultText
    }

    return toolName ? `Tool result: ${toolName}` : ''
}

function readOutputMessageContentText(
    content: unknown,
    field: string
): string {
    if (typeof content === 'string') {
        return content
    }

    if (!Array.isArray(content)) {
        throw new SessionHandoffContractError('transcript_message_invalid', field)
    }

    const textParts: string[] = []
    for (const block of content) {
        if (!isObject(block) || typeof block.type !== 'string') {
            continue
        }

        if (block.type === 'text' && typeof block.text === 'string') {
            textParts.push(block.text)
            continue
        }

        if ((block.type === 'tool_use' || block.type === 'toolCall') && typeof block.name === 'string') {
            textParts.push(`Tool call: ${block.name}`)
            continue
        }

        if (block.type === 'tool_result') {
            const toolName = typeof block.tool_name === 'string'
                ? block.tool_name
                : typeof block.toolName === 'string'
                    ? block.toolName
                    : null
            const resultText = readToolResultText(block.content)
            if (resultText) {
                textParts.push(toolName ? `Tool result: ${toolName}\n${resultText}` : resultText)
            } else if (toolName) {
                textParts.push(`Tool result: ${toolName}`)
            }
        }
    }

    return textParts.join('\n\n')
}

function readToolResultText(content: unknown): string {
    if (typeof content === 'string') {
        return content
    }

    if (!Array.isArray(content)) {
        return ''
    }

    return content.flatMap((block) => {
        if (!isObject(block) || block.type !== 'text' || typeof block.text !== 'string') {
            return []
        }

        return [block.text]
    }).join('\n\n')
}

function readSessionHandoffAttachments(
    content: Record<string, unknown>,
    messageIndex: number
): SessionHandoffAttachment[] {
    if (!('attachments' in content) || content.attachments == null) {
        return []
    }
    if (!Array.isArray(content.attachments)) {
        throw new SessionHandoffContractError(
            'attachment_payload_invalid',
            `messages[${messageIndex}].content.attachments`
        )
    }

    const attachments: SessionHandoffAttachment[] = []
    for (let index = 0; index < content.attachments.length; index += 1) {
        const parsed = SessionHandoffAttachmentSchema.safeParse(content.attachments[index])
        if (!parsed.success) {
            throw new SessionHandoffContractError(
                'attachment_payload_invalid',
                `messages[${messageIndex}].content.attachments[${index}]`
            )
        }
        attachments.push(parsed.data)
    }

    return attachments
}

function mergeSessionHandoffAttachments(
    attachmentsByPath: Map<string, SessionHandoffAttachment>,
    attachments: ReadonlyArray<SessionHandoffAttachment>,
    messageIndex: number
): void {
    for (let index = 0; index < attachments.length; index += 1) {
        const attachment = attachments[index]
        const previous = attachmentsByPath.get(attachment.path)

        if (!previous) {
            attachmentsByPath.set(attachment.path, attachment)
            continue
        }

        const isSameAttachment = previous.filename === attachment.filename
            && previous.mimeType === attachment.mimeType
            && previous.size === attachment.size
        if (!isSameAttachment) {
            throw new SessionHandoffContractError(
                'attachment_payload_invalid',
                `messages[${messageIndex}].content.attachments[${index}]`
            )
        }
    }
}

function raiseSessionHandoffContractError(
    code: SessionHandoffContractErrorCode,
    field: string
): never {
    throw new SessionHandoffContractError(code, field)
}
