import type { AgentMessage } from './types'

export type RateLimitResult = null | { suppress: true } | { suppress: false; message: AgentMessage }

function asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

export function parseRateLimitText(text: string): RateLimitResult {
    if (text[0] !== '{') return null

    let parsed: unknown
    try {
        parsed = JSON.parse(text)
    } catch {
        return null
    }

    const record = asRecord(parsed)
    if (!record) return null

    const inner = record.type === 'output' ? (asRecord(record.data) ?? record) : record
    if (inner.type !== 'rate_limit_event') return null

    const info = asRecord(inner.rate_limit_info)
    if (!info) return { suppress: true }

    const { status, resetsAt, utilization, rateLimitType } = info
    if (status === 'allowed') return { suppress: true }
    if (typeof resetsAt !== 'number') return { suppress: true }

    const resetAt = Math.round(resetsAt)
    const limitType = typeof rateLimitType === 'string' ? rateLimitType : ''

    if (status === 'allowed_warning') {
        const pct = typeof utilization === 'number' ? Math.round(utilization * 100) : 0
        return {
            suppress: false,
            message: {
                type: 'text',
                text: `Claude AI usage limit warning|${resetAt}|${pct}|${limitType}`,
            },
        }
    }

    if (status === 'rejected') {
        return {
            suppress: false,
            message: {
                type: 'text',
                text: `Claude AI usage limit reached|${resetAt}|${limitType}`,
            },
        }
    }

    return { suppress: true }
}
