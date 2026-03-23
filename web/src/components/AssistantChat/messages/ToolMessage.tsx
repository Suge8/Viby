import type { ToolCallMessagePartProps } from '@assistant-ui/react'
import type { ChatBlock } from '@/chat/types'
import type { ToolCallBlock } from '@/chat/types'
import { isObject, safeStringify } from '@viby/protocol'
import { getEventPresentation } from '@/chat/presentation'
import { CodeBlock } from '@/components/CodeBlock'
import { MarkdownRenderer } from '@/components/MarkdownRenderer'
import { LazyRainbowText } from '@/components/LazyRainbowText'
import { CliOutputMessageContent } from '@/components/AssistantChat/messages/CliOutputMessageContent'
import { MessageSurface } from '@/components/AssistantChat/messages/MessageSurface'
import { MessageStatusIndicator } from '@/components/AssistantChat/messages/MessageStatusIndicator'
import { ToolCard } from '@/components/ToolCard/ToolCard'
import { useVibyChatContext } from '@/components/AssistantChat/context'
import { getThreadMessageId, THREAD_MESSAGE_ID_ATTRIBUTE } from '@/components/AssistantChat/threadMessageIdentity'

const USER_MESSAGE_CARD_CLASS = 'ds-message-card-right'
const FULL_WIDTH_MESSAGE_CARD_CLASS = 'ds-message-card'

function isToolCallBlock(value: unknown): value is ToolCallBlock {
    if (!isObject(value)) return false
    if (value.kind !== 'tool-call') return false
    if (typeof value.id !== 'string') return false
    if (value.localId !== null && typeof value.localId !== 'string') return false
    if (typeof value.createdAt !== 'number') return false
    if (!Array.isArray(value.children)) return false
    if (!isObject(value.tool)) return false
    if (typeof value.tool.name !== 'string') return false
    if (!('input' in value.tool)) return false
    if (value.tool.description !== null && typeof value.tool.description !== 'string') return false
    if (value.tool.state !== 'pending' && value.tool.state !== 'running' && value.tool.state !== 'completed' && value.tool.state !== 'error') return false
    return true
}

function isPendingPermissionBlock(block: ChatBlock): boolean {
    return block.kind === 'tool-call' && block.tool.permission?.status === 'pending'
}

function splitTaskChildren(block: ToolCallBlock): { pending: ChatBlock[]; rest: ChatBlock[] } {
    const pending: ChatBlock[] = []
    const rest: ChatBlock[] = []

    for (const child of block.children) {
        if (isPendingPermissionBlock(child)) {
            pending.push(child)
        } else {
            rest.push(child)
        }
    }

    return { pending, rest }
}

function VibyNestedBlockList(props: {
    blocks: ChatBlock[]
}) {
    const ctx = useVibyChatContext()

    return (
        <div className="flex flex-col gap-3">
            {props.blocks.map((block) => {
                if (block.kind === 'user-text') {
                    const status = block.status
                    const canRetry = status === 'failed' && typeof block.localId === 'string' && Boolean(ctx.onRetryMessage)
                    const onRetry = canRetry ? () => ctx.onRetryMessage!(block.localId!) : undefined

                    return (
                        <div
                            key={`user:${block.id}`}
                            className="flex min-w-0 max-w-full justify-end px-1"
                            {...{ [THREAD_MESSAGE_ID_ATTRIBUTE]: getThreadMessageId(block) }}
                        >
                            <MessageSurface tone="user" copyText={block.text}>
                                <div className="flex min-w-0 items-end gap-2">
                                    <div className="min-w-0 flex-1">
                                        <LazyRainbowText text={block.text} />
                                    </div>
                                    {status ? (
                                        <div className="shrink-0 self-end pb-0.5">
                                            <MessageStatusIndicator status={status} onRetry={onRetry} />
                                        </div>
                                    ) : null}
                                </div>
                            </MessageSurface>
                        </div>
                    )
                }

                if (block.kind === 'agent-text') {
                    return (
                        <div
                            key={`agent:${block.id}`}
                            className="ds-message-card px-1"
                            {...{ [THREAD_MESSAGE_ID_ATTRIBUTE]: getThreadMessageId(block) }}
                        >
                            <MessageSurface tone="assistant" copyText={block.text}>
                                <MarkdownRenderer content={block.text} />
                            </MessageSurface>
                        </div>
                    )
                }

                if (block.kind === 'cli-output') {
                    const cardClass = block.source === 'user' ? USER_MESSAGE_CARD_CLASS : FULL_WIDTH_MESSAGE_CARD_CLASS
                    return (
                        <div
                            key={`cli:${block.id}`}
                            className="px-1 min-w-0 max-w-full overflow-x-hidden"
                            data-prevent-message-copy
                            {...{ [THREAD_MESSAGE_ID_ATTRIBUTE]: getThreadMessageId(block) }}
                        >
                            <div className={cardClass}>
                                <CliOutputMessageContent text={block.text} />
                            </div>
                        </div>
                    )
                }

                if (block.kind === 'agent-event') {
                    const presentation = getEventPresentation(block.event)
                    return (
                        <div
                            key={`event:${block.id}`}
                            className="py-1"
                            {...{ [THREAD_MESSAGE_ID_ATTRIBUTE]: getThreadMessageId(block) }}
                        >
                            <div className="ds-message-note">
                                <span className="inline-flex items-center gap-1">
                                    {presentation.icon ? <span aria-hidden="true">{presentation.icon}</span> : null}
                                    <span>{presentation.text}</span>
                                </span>
                            </div>
                        </div>
                    )
                }

                if (block.kind === 'tool-call') {
                    const isTask = block.tool.name === 'Task'
                    const taskChildren = isTask ? splitTaskChildren(block) : null

                    return (
                        <div key={`tool:${block.id}`} className="py-1" data-prevent-message-copy>
                            <div {...{ [THREAD_MESSAGE_ID_ATTRIBUTE]: getThreadMessageId(block) }}>
                                <ToolCard
                                    api={ctx.api}
                                    sessionId={ctx.sessionId}
                                    metadata={ctx.metadata}
                                    disabled={ctx.disabled}
                                    onDone={ctx.onRefresh}
                                    block={block}
                                />
                            </div>
                            {block.children.length > 0 ? (
                                isTask ? (
                                    <>
                                        {taskChildren && taskChildren.pending.length > 0 ? (
                                            <div className="mt-2 pl-3">
                                                <VibyNestedBlockList blocks={taskChildren.pending} />
                                            </div>
                                        ) : null}
                                        {taskChildren && taskChildren.rest.length > 0 ? (
                                            <details className="mt-2">
                                                <summary className="cursor-pointer text-xs text-[var(--app-hint)]">
                                                    Task details ({taskChildren.rest.length})
                                                </summary>
                                                <div className="mt-2 pl-3">
                                                    <VibyNestedBlockList blocks={taskChildren.rest} />
                                                </div>
                                            </details>
                                        ) : null}
                                    </>
                                ) : (
                                    <div className="mt-2 pl-3">
                                        <VibyNestedBlockList blocks={block.children} />
                                    </div>
                                )
                            ) : null}
                        </div>
                    )
                }

                return null
            })}
        </div>
    )
}

export function VibyToolMessage(props: ToolCallMessagePartProps) {
    const ctx = useVibyChatContext()
    const artifact = props.artifact

    if (!isToolCallBlock(artifact)) {
        const argsText = typeof props.argsText === 'string' ? props.argsText.trim() : ''
        const hasArgsText = argsText.length > 0
        const hasResult = props.result !== undefined
        const resultText = hasResult ? safeStringify(props.result) : ''

        return (
            <div className="py-1 min-w-0 max-w-full overflow-x-hidden" data-prevent-message-copy>
                <div className="ds-message-card rounded-xl bg-[var(--app-secondary-bg)] p-3 shadow-sm">
                    <div className="flex items-center gap-2 text-xs">
                        <div className="font-mono text-[var(--app-hint)]">
                            Tool: {props.toolName}
                        </div>
                        {props.isError ? (
                            <span className="text-red-500">Error</span>
                        ) : null}
                        {props.status.type === 'running' && !hasResult ? (
                            <span className="text-[var(--app-hint)]">Running…</span>
                        ) : null}
                    </div>

                    {hasArgsText ? (
                        <div className="mt-2">
                            <CodeBlock code={argsText} language="json" highlight="never" />
                        </div>
                    ) : null}

                    {hasResult ? (
                        <div className="mt-2">
                            <CodeBlock
                                code={resultText}
                                language={typeof props.result === 'string' ? 'text' : 'json'}
                                highlight="never"
                            />
                        </div>
                    ) : null}
                </div>
            </div>
        )
    }

    const block = artifact
    const isTask = block.tool.name === 'Task'
    const taskChildren = isTask ? splitTaskChildren(block) : null

    return (
        <div className="py-1 min-w-0 max-w-full overflow-x-hidden" data-prevent-message-copy>
            <div {...{ [THREAD_MESSAGE_ID_ATTRIBUTE]: getThreadMessageId(block) }}>
                <ToolCard
                    api={ctx.api}
                    sessionId={ctx.sessionId}
                    metadata={ctx.metadata}
                    disabled={ctx.disabled}
                    onDone={ctx.onRefresh}
                    block={block}
                />
            </div>
            {block.children.length > 0 ? (
                isTask ? (
                    <>
                        {taskChildren && taskChildren.pending.length > 0 ? (
                            <div className="mt-2 pl-3">
                                <VibyNestedBlockList blocks={taskChildren.pending} />
                            </div>
                        ) : null}
                        {taskChildren && taskChildren.rest.length > 0 ? (
                            <details className="mt-2">
                                <summary className="cursor-pointer text-xs text-[var(--app-hint)]">
                                    Task details ({taskChildren.rest.length})
                                </summary>
                                <div className="mt-2 pl-3">
                                    <VibyNestedBlockList blocks={taskChildren.rest} />
                                </div>
                            </details>
                        ) : null}
                    </>
                ) : (
                    <div className="mt-2 pl-3">
                        <VibyNestedBlockList blocks={block.children} />
                    </div>
                )
            ) : null}
        </div>
    )
}
