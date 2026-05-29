import type { ToolCallBlock } from '@/chat/types'

const NO_TOOL_RESULT_TEXT = '(no output)'
export const TOOL_SUBTITLE_TRUNCATE_LENGTH = 160

function placeholderForToolState(state: ToolCallBlock['tool']['state']): string {
    if (state === 'pending') {
        return 'Waiting for permission…'
    }
    if (state === 'running') {
        return 'Running…'
    }
    return NO_TOOL_RESULT_TEXT
}

export function getToolResultPlaceholderText(state: ToolCallBlock['tool']['state']): string {
    return placeholderForToolState(state)
}
