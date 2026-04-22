import { unwrapRoleWrappedRecordEnvelope } from './messages'
import type { DecryptedMessage, Session } from './schemas'
import { resolveSessionDriver } from './sessionDriver'
import { mergeSessionHandoffAttachments, readSessionHandoffAttachments } from './sessionHandoffAttachmentProjection'
import {
    type SessionHandoffAttachment,
    SessionHandoffContractError,
    type SessionHandoffContractErrorCode,
    type SessionHandoffMessage,
    type SessionHandoffSnapshot,
} from './sessionHandoffContract'
import { isObject } from './utils'

type SessionHandoffProjection = {
    message: SessionHandoffMessage | null
    attachments: SessionHandoffAttachment[]
}

type SessionHandoffMetadataSource = NonNullable<Session['metadata']>

const HANDOFF_ROLE_MAP = {
    agent: 'assistant',
    user: 'user',
} as const
const READY_EVENT_TYPE = 'ready'
const TEXT_CONTENT_TYPE = 'text'
const OUTPUT_CONTENT_TYPE = 'output'

export function parseSessionHandoffMetadata(metadata: Session['metadata']): {
    workingDirectory: string
    driver: SessionHandoffSnapshot['driver']
} {
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

export function projectSessionHandoffHistory(
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

function readWorkingDirectory(metadata: SessionHandoffMetadataSource): string {
    return typeof metadata.path === 'string' && metadata.path.length > 0
        ? metadata.path
        : raiseSessionHandoffContractError('working_directory_missing', 'metadata.path')
}

function projectSessionHandoffMessage(message: DecryptedMessage, messageIndex: number): SessionHandoffProjection {
    const record = unwrapRoleWrappedRecordEnvelope(message.content)
    if (!record) {
        return { message: null, attachments: [] }
    }

    const role = normalizeSessionHandoffRole(record.role)
    if (!role) {
        return { message: null, attachments: [] }
    }

    if (!isObject(record.content)) {
        throw new SessionHandoffContractError('transcript_message_invalid', `messages[${messageIndex}].content`)
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

function normalizeSessionHandoffRole(role: unknown): SessionHandoffMessage['role'] | null {
    return typeof role === 'string' && role in HANDOFF_ROLE_MAP
        ? HANDOFF_ROLE_MAP[role as keyof typeof HANDOFF_ROLE_MAP]
        : null
}

function isReadyEventPayload(value: Record<string, unknown>): boolean {
    return value.type === 'event' && isObject(value.data) && value.data.type === READY_EVENT_TYPE
}

function readSessionHandoffOutputText(content: Record<string, unknown>, messageIndex: number): string | null {
    if (content.type !== OUTPUT_CONTENT_TYPE) {
        return null
    }

    const data = isObject(content.data)
        ? content.data
        : raiseSessionHandoffContractError('transcript_message_invalid', `messages[${messageIndex}].content.data`)

    if (data.type === 'assistant') {
        return readAssistantOutputText(data, messageIndex)
    }
    if (data.type === 'user') {
        return readUserOutputText(data, messageIndex)
    }
    return null
}

function readAssistantOutputText(data: Record<string, unknown>, messageIndex: number): string {
    const message = isObject(data.message)
        ? data.message
        : raiseSessionHandoffContractError(
              'transcript_message_invalid',
              `messages[${messageIndex}].content.data.message`
          )

    return readOutputMessageContentText(message.content, `messages[${messageIndex}].content.data.message.content`)
}

function readUserOutputText(data: Record<string, unknown>, messageIndex: number): string {
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

function readOutputMessageContentText(content: unknown, field: string): string {
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
            const toolName =
                typeof block.tool_name === 'string'
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

    return content
        .flatMap((block) =>
            isObject(block) && block.type === 'text' && typeof block.text === 'string' ? [block.text] : []
        )
        .join('\n\n')
}

function raiseSessionHandoffContractError(code: SessionHandoffContractErrorCode, field: string): never {
    throw new SessionHandoffContractError(code, field)
}
