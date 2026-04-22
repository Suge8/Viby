import type { TextRenderMode } from '@/chat/textRenderMode'
import type {
    AgentEventBlock,
    AgentReasoningBlock,
    AgentTextBlock,
    ChatBlock,
    CliOutputBlock,
    ToolCallBlock,
    UserTextBlock,
} from '@/chat/types'

export type TranscriptSentFrom = 'cli' | 'webapp' | 'user'

type TranscriptRowBase = {
    id: string
    conversationId: string
    depth: number
    copyText: string | null
}

export type TranscriptUserRow = TranscriptRowBase & {
    type: 'user'
    block: UserTextBlock
    tone: 'user'
}

export type TranscriptAssistantTextRow = TranscriptRowBase & {
    type: 'assistant-text'
    block: AgentTextBlock
}

export type TranscriptReasoningRow = TranscriptRowBase & {
    type: 'assistant-reasoning'
    blocks: readonly AgentReasoningBlock[]
    text: string
    renderMode: TextRenderMode
}

export type TranscriptToolRow = TranscriptRowBase & {
    type: 'tool'
    block: ToolCallBlock
}

export type TranscriptCliOutputRow = TranscriptRowBase & {
    type: 'cli-output'
    block: CliOutputBlock
}

export type TranscriptEventRow = TranscriptRowBase & {
    type: 'event'
    block: AgentEventBlock
}

export type TranscriptRow =
    | TranscriptUserRow
    | TranscriptAssistantTextRow
    | TranscriptReasoningRow
    | TranscriptToolRow
    | TranscriptCliOutputRow
    | TranscriptEventRow

export type TranscriptRowGap = 'compact' | 'base' | 'loose' | 'none'

export type TranscriptRenderRow = {
    row: TranscriptRow
    gap: TranscriptRowGap
}

export type TranscriptModel = {
    rows: TranscriptRow[]
    renderRows: TranscriptRenderRow[]
    conversationIds: string[]
    rowStartIndexByConversationId: ReadonlyMap<string, number>
    historyJumpTargetConversationIds: string[]
}

export const TRANSCRIPT_REASONING_GROUP_PREFIX = 'reasoning-group:'

export function getTranscriptRowId(block: ChatBlock): string {
    switch (block.kind) {
        case 'user-text':
            return `user:${block.id}`
        case 'agent-text':
            return `assistant:${block.id}`
        case 'agent-reasoning':
            return `reasoning:${block.id}`
        case 'agent-event':
            return `event:${block.id}`
        case 'cli-output':
            return `cli:${block.id}`
        case 'tool-call':
            return `tool:${block.id}`
    }
}
