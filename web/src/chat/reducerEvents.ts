import type { AgentEvent, AgentEventBlock, ChatBlock, NormalizedMessage } from '@/chat/types'

function parseTimestamp(value: string | undefined): number | null {
    if (!value) return null
    const timestamp = Number.parseInt(value, 10)
    return Number.isFinite(timestamp) ? timestamp : null
}

function parseClaudeUsageLimit(text: string): AgentEvent | null {
    const reached = text.match(/^Claude AI usage limit reached\|(\d+)(?:\|([^|]*))?$/)
    if (reached) {
        const endsAt = parseTimestamp(reached[1])
        if (endsAt === null) return null
        return {
            type: 'limit-reached',
            endsAt,
            ...(reached[2] ? { limitType: reached[2] } : {}),
        }
    }

    const warning = text.match(/^Claude AI usage limit warning\|(\d+)\|(\d+)(?:\|([^|]*))?$/)
    if (!warning) return null
    const endsAt = parseTimestamp(warning[1])
    const percent = Number.parseInt(warning[2] ?? '', 10)
    if (endsAt === null || !Number.isFinite(percent)) return null
    return {
        type: 'limit-warning',
        endsAt,
        percent,
        ...(warning[3] ? { limitType: warning[3] } : {}),
    }
}

export function parseMessageAsEvent(msg: NormalizedMessage): AgentEvent | null {
    if (msg.isSidechain) return null
    if (msg.role !== 'agent') return null

    for (const content of msg.content) {
        if (content.type === 'text') {
            const event = parseClaudeUsageLimit(content.text)
            if (event) {
                return event
            }
        }
    }

    return null
}

export function dedupeAgentEvents(blocks: ChatBlock[]): ChatBlock[] {
    const result: ChatBlock[] = []
    let prevEventKey: string | null = null

    for (const block of blocks) {
        if (block.kind !== 'agent-event') {
            result.push(block)
            prevEventKey = null
            continue
        }

        const event = block.event as { type: string; [key: string]: unknown }
        if (event.type === 'message' && typeof event.message === 'string') {
            const message = event.message.trim()
            const key = `message:${message}`
            if (key === prevEventKey) {
                continue
            }
            result.push(block)
            prevEventKey = key
            continue
        }

        let key: string
        try {
            key = `event:${JSON.stringify(event)}`
        } catch {
            key = `event:${String(event.type)}`
        }

        if (key === prevEventKey) {
            continue
        }

        result.push(block)
        prevEventKey = key
    }

    return result
}

/**
 * Fold consecutive api-error events, keeping only the latest state.
 */
export function foldApiErrorEvents(blocks: ChatBlock[]): ChatBlock[] {
    const result: ChatBlock[] = []

    for (const block of blocks) {
        if (block.kind !== 'agent-event') {
            result.push(block)
            continue
        }

        const event = block.event as { type: string }
        if (event.type !== 'api-error') {
            result.push(block)
            continue
        }

        const prev = result[result.length - 1] as AgentEventBlock | undefined
        if (prev?.kind === 'agent-event' && (prev.event as { type: string }).type === 'api-error') {
            result[result.length - 1] = block
        } else {
            result.push(block)
        }
    }

    return result
}
