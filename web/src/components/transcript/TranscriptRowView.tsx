import { type CSSProperties, memo } from 'react'
import type { TranscriptRow } from '@/chat/transcriptTypes'
import { AssistantReplyingIndicator } from '@/components/AssistantChat/AssistantReplyingIndicator'
import { useVibyChatContext, type VibyChatContextValue } from '@/components/AssistantChat/context'
import { CliOutputMessageContent } from '@/components/AssistantChat/messages/CliOutputMessageContent'
import { MessageAttachments } from '@/components/AssistantChat/messages/MessageAttachments'
import { MessageStatusIndicator } from '@/components/AssistantChat/messages/MessageStatusIndicator'
import { MessageSurface } from '@/components/AssistantChat/messages/MessageSurface'
import { TextContent } from '@/components/TextContent'
import { ToolCard } from '@/components/ToolCard/ToolCard'
import { TranscriptEventNotice } from '@/components/transcript/TranscriptEventNotice'
import { TranscriptReasoningGroup } from '@/components/transcript/TranscriptReasoningGroup'
import { isImageMimeType } from '@/lib/fileAttachments'

const NESTED_ROW_INDENT_PX = 18
const MARKDOWN_IMAGE_ONLY_PATTERN = /^!\[[^\]]*]\([^)]+\)$/
const DEFAULT_MESSAGE_SURFACE_CONTENT_LAYOUT = 'default'
const MEDIA_ONLY_MESSAGE_SURFACE_CONTENT_LAYOUT = 'media-only'

function getDepthStyle(depth: number): CSSProperties | undefined {
    if (depth <= 0) {
        return undefined
    }

    return {
        marginLeft: `${depth * NESTED_ROW_INDENT_PX}px`,
    }
}

function DepthInset(props: { depth: number; children: React.ReactNode }): React.JSX.Element {
    if (props.depth <= 0) {
        return <>{props.children}</>
    }

    return (
        <div className="ds-chat-branch-rail" style={getDepthStyle(props.depth)}>
            {props.children}
        </div>
    )
}

function isMarkdownImageOnly(text: string): boolean {
    return MARKDOWN_IMAGE_ONLY_PATTERN.test(text.trim())
}

function resolveMessageSurfaceContentLayout(options: {
    text: string
    renderMode?: string
    attachments?: Array<{ mimeType: string; previewUrl?: string | null }>
}): 'default' | 'media-only' {
    if (options.renderMode === 'markdown' && isMarkdownImageOnly(options.text)) {
        return MEDIA_ONLY_MESSAGE_SURFACE_CONTENT_LAYOUT
    }

    const attachments = options.attachments ?? []
    if (
        attachments.length > 0 &&
        options.text.trim().length === 0 &&
        attachments.every((attachment) => isImageMimeType(attachment.mimeType) && Boolean(attachment.previewUrl))
    ) {
        return MEDIA_ONLY_MESSAGE_SURFACE_CONTENT_LAYOUT
    }

    return DEFAULT_MESSAGE_SURFACE_CONTENT_LAYOUT
}

function renderRowContent(row: TranscriptRow, ctx: VibyChatContextValue): React.JSX.Element | null {
    if (row.type === 'event') {
        return (
            <DepthInset depth={row.depth}>
                <div>
                    <TranscriptEventNotice event={row.block.event} />
                </div>
            </DepthInset>
        )
    }

    if (row.type === 'cli-output') {
        const cardClass = row.block.source === 'user' ? 'ds-message-card-right' : 'ds-message-card'
        return (
            <DepthInset depth={row.depth}>
                <div className="px-1 min-w-0 max-w-full overflow-x-hidden">
                    <div className={cardClass}>
                        <CliOutputMessageContent text={row.block.text} />
                    </div>
                </div>
            </DepthInset>
        )
    }

    if (row.type === 'assistant-reasoning') {
        return (
            <DepthInset depth={row.depth}>
                <div className="w-full min-w-0 px-1">
                    <TranscriptReasoningGroup text={row.text} mode={row.renderMode} />
                </div>
            </DepthInset>
        )
    }

    if (row.type === 'tool') {
        return (
            <DepthInset depth={row.depth}>
                <div>
                    <ToolCard
                        api={ctx.api}
                        sessionId={ctx.sessionId}
                        metadata={ctx.metadata}
                        disabled={ctx.disabled}
                        onDone={ctx.onRefresh}
                        block={row.block}
                    />
                </div>
            </DepthInset>
        )
    }

    if (row.type === 'assistant-thinking') {
        return (
            <DepthInset depth={row.depth}>
                <div className="flex min-w-0 max-w-full justify-start px-1">
                    <AssistantReplyingIndicator phase={row.phase} />
                </div>
            </DepthInset>
        )
    }

    if (row.type === 'assistant-text') {
        const contentLayout = resolveMessageSurfaceContentLayout({
            text: row.block.text,
            renderMode: row.block.renderMode,
        })
        return (
            <DepthInset depth={row.depth}>
                <div className="w-full min-w-0 max-w-full overflow-x-hidden px-1">
                    <MessageSurface tone="assistant" contentLayout={contentLayout} copyText={row.copyText}>
                        <TextContent text={row.block.text} mode={row.block.renderMode} />
                    </MessageSurface>
                </div>
            </DepthInset>
        )
    }

    const status = row.block.status
    const canRetry = status === 'failed' && typeof row.block.localId === 'string' && Boolean(ctx.onRetryMessage)
    const retry = canRetry ? () => ctx.onRetryMessage!(row.block.localId!) : undefined
    const hasAttachments = row.block.attachments && row.block.attachments.length > 0
    const contentLayout = resolveMessageSurfaceContentLayout({
        text: row.block.text,
        renderMode: row.block.renderMode,
        attachments: row.block.attachments ?? [],
    })

    return (
        <DepthInset depth={row.depth}>
            <div className="flex min-w-0 max-w-full justify-end px-1">
                <MessageSurface tone={row.tone} contentLayout={contentLayout} copyText={row.copyText}>
                    <div className="flex min-w-0 items-end gap-2">
                        <div className="min-w-0 flex-1">
                            <TextContent text={row.block.text} mode={row.block.renderMode} />
                            {hasAttachments ? <MessageAttachments attachments={row.block.attachments ?? []} /> : null}
                        </div>
                        {status ? (
                            <div className="shrink-0 self-end pb-0.5">
                                <MessageStatusIndicator status={status} onRetry={retry} />
                            </div>
                        ) : null}
                    </div>
                </MessageSurface>
            </div>
        </DepthInset>
    )
}

// Row mount motion is owned by a single CSS keyframe driven by the
// `data-fresh` attribute on the outer row container (see
// `design-system-motion.css`). The row view itself stays as a pure renderer
// with no motion-library wrappers so virtualized mount/unmount stays cheap.
function TranscriptRowViewComponent(props: { row: TranscriptRow }): React.JSX.Element | null {
    const ctx = useVibyChatContext()
    const content = renderRowContent(props.row, ctx)
    if (!content) {
        return null
    }
    return content
}

export const TranscriptRowView = memo(TranscriptRowViewComponent, (prev, next) => prev.row === next.row)
