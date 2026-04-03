import { useCallback, useMemo } from 'react'
import type { AppendMessage, AttachmentAdapter, ThreadMessageLike } from '@assistant-ui/react'
import { useExternalMessageConverter, useExternalStoreRuntime } from '@assistant-ui/react'
import { safeStringify } from '@viby/protocol/utils'
import { renderEventLabel } from '@/chat/presentation'
import type { TextRenderMode } from '@/chat/textRenderMode'
import type { ChatBlock, CliOutputBlock } from '@/chat/types'
import type { AgentEvent, ToolCallBlock } from '@/chat/types'
import type { AttachmentMetadata, MessageStatus as VibyMessageStatus, Session } from '@/types/api'
import { getThreadMessageId } from '@/components/AssistantChat/threadMessageIdentity'

export type VibyChatMessageMetadata = {
    kind: 'user' | 'assistant' | 'tool' | 'event' | 'cli-output' | 'team-notice'
    renderMode?: TextRenderMode
    status?: VibyMessageStatus
    localId?: string | null
    originalText?: string
    toolCallId?: string
    event?: AgentEvent
    source?: CliOutputBlock['source']
    attachments?: AttachmentMetadata[]
    sentFrom?: 'cli' | 'webapp' | 'manager' | 'user' | 'team-system'
    teamProjectId?: string
    managerSessionId?: string
    memberId?: string
    sessionRole?: 'manager' | 'member'
    teamMessageKind?: 'task-assign' | 'follow-up' | 'review-request' | 'verify-request' | 'coordination' | 'system-event'
    controlOwner?: 'manager' | 'user'
}

function extractTeamMetadata(meta: unknown): Partial<VibyChatMessageMetadata> | null {
    if (!meta || typeof meta !== 'object') {
        return null
    }

    const record = meta as Record<string, unknown>
    const sentFrom = parseTeamSentFrom(record.sentFrom)
    const sessionRole = parseSessionRole(record.sessionRole)
    const teamMessageKind = parseTeamMessageKind(record.teamMessageKind)
    const controlOwner = parseControlOwner(record.controlOwner)
    const teamProjectId = asOptionalString(record.teamProjectId)
    const managerSessionId = asOptionalString(record.managerSessionId)
    const memberId = asOptionalString(record.memberId)

    const hasTeamMetadata = sentFrom !== undefined
        || sessionRole !== undefined
        || teamMessageKind !== undefined
        || controlOwner !== undefined
        || teamProjectId !== undefined
        || managerSessionId !== undefined
        || memberId !== undefined

    if (!hasTeamMetadata) {
        return null
    }

    return {
        sentFrom,
        teamProjectId,
        managerSessionId,
        memberId,
        sessionRole,
        teamMessageKind,
        controlOwner
    }
}

function asOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined
}

function parseTeamSentFrom(value: unknown): VibyChatMessageMetadata['sentFrom'] | undefined {
    switch (value) {
        case 'cli':
        case 'webapp':
        case 'manager':
        case 'user':
        case 'team-system':
            return value
        default:
            return undefined
    }
}

function parseSessionRole(value: unknown): VibyChatMessageMetadata['sessionRole'] | undefined {
    switch (value) {
        case 'manager':
        case 'member':
            return value
        default:
            return undefined
    }
}

function parseTeamMessageKind(value: unknown): VibyChatMessageMetadata['teamMessageKind'] | undefined {
    switch (value) {
        case 'task-assign':
        case 'follow-up':
        case 'review-request':
        case 'verify-request':
        case 'coordination':
        case 'system-event':
            return value
        default:
            return undefined
    }
}

function parseControlOwner(value: unknown): VibyChatMessageMetadata['controlOwner'] | undefined {
    switch (value) {
        case 'manager':
        case 'user':
            return value
        default:
            return undefined
    }
}

export function toThreadMessageLike(block: ChatBlock): ThreadMessageLike {
    const messageId = getThreadMessageId(block)
    const teamMetadata = extractTeamMetadata(block.meta)

    if (block.kind === 'user-text') {
        if (teamMetadata?.sentFrom === 'team-system') {
            return {
                role: 'system',
                id: messageId,
                createdAt: new Date(block.createdAt),
                content: [{ type: 'text', text: block.text }],
                metadata: {
                    custom: {
                        kind: 'team-notice',
                        renderMode: block.renderMode,
                        status: block.status,
                        localId: block.localId,
                        originalText: block.originalText,
                        attachments: block.attachments,
                        ...teamMetadata
                    } satisfies VibyChatMessageMetadata
                }
            }
        }

        return {
            role: 'user',
            id: messageId,
            createdAt: new Date(block.createdAt),
            content: [{ type: 'text', text: block.text }],
            metadata: {
                custom: {
                    kind: 'user',
                    renderMode: block.renderMode,
                    status: block.status,
                    localId: block.localId,
                    originalText: block.originalText,
                    attachments: block.attachments,
                    ...teamMetadata
                } satisfies VibyChatMessageMetadata
            }
        }
    }

    if (block.kind === 'agent-text') {
        return {
            role: 'assistant',
            id: messageId,
            createdAt: new Date(block.createdAt),
            content: [{ type: 'text', text: block.text }],
            metadata: {
                custom: {
                    kind: 'assistant',
                    renderMode: block.renderMode
                } satisfies VibyChatMessageMetadata
            }
        }
    }

    if (block.kind === 'agent-reasoning') {
        return {
            role: 'assistant',
            id: messageId,
            createdAt: new Date(block.createdAt),
            content: [{ type: 'reasoning', text: block.text }],
            metadata: {
                custom: { kind: 'assistant' } satisfies VibyChatMessageMetadata
            }
        }
    }

    if (block.kind === 'agent-event') {
        return {
            role: 'system',
            id: messageId,
            createdAt: new Date(block.createdAt),
            content: [{ type: 'text', text: renderEventLabel(block.event) }],
            metadata: {
                custom: { kind: 'event', event: block.event } satisfies VibyChatMessageMetadata
            }
        }
    }

    if (block.kind === 'cli-output') {
        return {
            role: block.source === 'user' ? 'user' : 'assistant',
            id: messageId,
            createdAt: new Date(block.createdAt),
            content: [{ type: 'text', text: block.text }],
            metadata: {
                custom: { kind: 'cli-output', source: block.source } satisfies VibyChatMessageMetadata
            }
        }
    }

    const toolBlock: ToolCallBlock = block
    const inputText = safeStringify(toolBlock.tool.input)

    return {
        role: 'assistant',
        id: messageId,
        createdAt: new Date(toolBlock.createdAt),
        content: [{
            type: 'tool-call',
            toolCallId: toolBlock.id,
            toolName: toolBlock.tool.name,
            argsText: inputText,
            result: toolBlock.tool.result,
            isError: toolBlock.tool.state === 'error',
            artifact: toolBlock
        }],
        metadata: {
            custom: { kind: 'tool', toolCallId: toolBlock.id } satisfies VibyChatMessageMetadata
        }
    }
}

type TextMessagePart = { type: 'text'; text: string }

function getTextFromParts(parts: readonly { type: string }[] | undefined): string {
    if (!parts) return ''

    return parts
        .filter((part): part is TextMessagePart => part.type === 'text' && typeof (part as TextMessagePart).text === 'string')
        .map((part) => part.text)
        .join('\n')
        .trim()
}

type ExtractedAttachmentMetadata = { __attachmentMetadata: AttachmentMetadata }

function isAttachmentMetadataJson(text: string): ExtractedAttachmentMetadata | null {
    try {
        const parsed = JSON.parse(text) as unknown
        if (parsed && typeof parsed === 'object' && '__attachmentMetadata' in parsed) {
            return parsed as ExtractedAttachmentMetadata
        }
        return null
    } catch {
        return null
    }
}

export function extractMessageContent(message: AppendMessage): { text: string; attachments: AttachmentMetadata[] } {
    if (message.role !== 'user') return { text: '', attachments: [] }

    // Extract attachments from attachment content
    const attachments: AttachmentMetadata[] = []
    const otherAttachmentTexts: string[] = []

    const attachmentParts = message.attachments?.flatMap((attachment) => attachment.content ?? []) ?? []
    for (const part of attachmentParts) {
        if (part.type === 'text' && typeof (part as TextMessagePart).text === 'string') {
            const textPart = part as TextMessagePart
            const extracted = isAttachmentMetadataJson(textPart.text)
            if (extracted) {
                attachments.push(extracted.__attachmentMetadata)
            } else {
                otherAttachmentTexts.push(textPart.text)
            }
        }
    }

    const contentText = getTextFromParts(message.content)
    const text = [otherAttachmentTexts.join('\n'), contentText]
        .filter((value) => value.length > 0)
        .join('\n\n')
        .trim()

    return { text, attachments }
}

export function useVibyRuntime(props: {
    session: Session
    blocks: readonly ChatBlock[]
    isSending: boolean
    onSendMessage: (text: string, attachments?: AttachmentMetadata[]) => void
    onAbort: () => Promise<void>
    attachmentAdapter?: AttachmentAdapter
    allowSendWhenInactive?: boolean
}) {
    // Use cached message converter for performance optimization
    // This prevents re-converting all messages on every render
    const convertedMessages = useExternalMessageConverter<ChatBlock>({
        callback: toThreadMessageLike,
        messages: props.blocks as ChatBlock[],
        isRunning: props.session.thinking,
    })

    const onNew = useCallback(async (message: AppendMessage) => {
        const { text, attachments } = extractMessageContent(message)
        if (!text && attachments.length === 0) return
        props.onSendMessage(text, attachments.length > 0 ? attachments : undefined)
    }, [props.onSendMessage])

    const onCancel = useCallback(async () => {
        await props.onAbort()
    }, [props.onAbort])

    // Memoize the adapter to avoid recreating on every render
    // useExternalStoreRuntime may use adapter identity for subscriptions
    const adapter = useMemo(() => ({
        isDisabled: props.isSending || (!props.session.active && !props.allowSendWhenInactive),
        isRunning: props.session.thinking,
        messages: convertedMessages,
        onNew,
        onCancel,
        adapters: props.attachmentAdapter ? { attachments: props.attachmentAdapter } : undefined,
        unstable_capabilities: { copy: true }
    }), [
        props.session.active,
        props.isSending,
        props.allowSendWhenInactive,
        props.session.thinking,
        convertedMessages,
        onNew,
        onCancel,
        props.attachmentAdapter
    ])

    return useExternalStoreRuntime(adapter)
}
