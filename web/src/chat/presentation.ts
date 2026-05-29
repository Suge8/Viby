import { isObject } from '@viby/protocol'
import { safeStringify } from '@viby/protocol/utils'
import type { AgentEvent } from '@/chat/types'
import { formatSessionAgentLabel } from '@/lib/sessionAgentLabel'

const EVENT_DETAIL_LIMIT = 4_000
const ASSISTANT_RETRY_TEXT = 'AI reply did not complete. Send again to retry.'

type ApiErrorEvent = { type: 'api-error'; retryAttempt: number; maxRetries: number; error?: unknown }
type DriverSwitchSendFailedEvent = Record<string, unknown> & { code?: unknown }
type LimitEvent = { type: 'limit-reached' | 'limit-warning'; endsAt?: unknown; percent?: unknown }
type TurnTerminalEvent = { type: 'turn-terminal'; status?: unknown; reason?: unknown }

export function formatUnixTimestamp(value: number): string {
    const ms = value < 1_000_000_000_000 ? value * 1000 : value
    const date = new Date(ms)
    if (Number.isNaN(date.getTime())) return String(value)
    return date.toLocaleString()
}

function formatDuration(ms: number): string {
    const seconds = ms / 1000
    if (seconds < 60) return `${seconds.toFixed(1)}s`
    const mins = Math.floor(seconds / 60)
    const secs = Math.round(seconds % 60)
    return `${mins}m ${secs}s`
}

function trimDetail(text: string): string | undefined {
    const trimmed = text.trim()
    if (!trimmed) return undefined
    return trimmed.length > EVENT_DETAIL_LIMIT ? `${trimmed.slice(0, EVENT_DETAIL_LIMIT)}…` : trimmed
}

function readEventDetail(value: unknown): string | undefined {
    if (typeof value === 'string') return trimDetail(value)
    if (value instanceof Error) return trimDetail(value.message)
    if (!isObject(value)) return undefined

    const message = readEventDetail(value.message)
    if (message) return message

    const error = readEventDetail(value.error)
    if (error) return error

    return trimDetail(safeStringify(value))
}

export type EventPresentation = {
    icon: string | null
    text: string
    tone: 'default' | 'info' | 'success' | 'warning' | 'danger'
    detail?: string
}

function withDetail(presentation: Omit<EventPresentation, 'detail'>, detail: unknown): EventPresentation {
    const text = readEventDetail(detail)
    return text ? { ...presentation, detail: text } : presentation
}

function getApiErrorPresentation(event: ApiErrorEvent): EventPresentation {
    if (event.maxRetries > 0 && event.retryAttempt >= event.maxRetries) {
        return withDetail({ icon: '⚠️', text: ASSISTANT_RETRY_TEXT, tone: 'danger' }, event.error)
    }
    if (event.maxRetries > 0) {
        return withDetail(
            {
                icon: '⏳',
                text: `AI service problem. Retrying (${event.retryAttempt}/${event.maxRetries})`,
                tone: 'warning',
            },
            event.error
        )
    }
    if (event.retryAttempt > 0) {
        return withDetail({ icon: '⏳', text: 'AI service problem. Retrying...', tone: 'warning' }, event.error)
    }
    return withDetail({ icon: '⚠️', text: 'AI service problem.', tone: 'warning' }, event.error)
}

function getDriverSwitchSendFailedPresentation(event: DriverSwitchSendFailedEvent): EventPresentation {
    if (event.code === 'empty_first_turn') {
        return { icon: '⚠️', text: 'The first post-switch message was empty and was not sent.', tone: 'warning' }
    }
    if (event.code === 'timeout') {
        return {
            icon: '⚠️',
            text: 'The first post-switch message timed out before the new agent accepted it.',
            tone: 'warning',
        }
    }
    return {
        icon: '⚠️',
        text: 'The first post-switch message failed before the new agent accepted it.',
        tone: 'warning',
    }
}

function getTurnTerminalPresentation(event: TurnTerminalEvent): EventPresentation {
    switch (event.status) {
        case 'completed':
            return { icon: null, text: 'Reply finished.', tone: 'default' }
        case 'truncated':
            return { icon: '↪️', text: 'Reply reached the model output limit.', tone: 'warning' }
        case 'aborted':
            return { icon: '⏹️', text: 'Reply stopped.', tone: 'info' }
        case 'failed':
            return withDetail({ icon: '⚠️', text: ASSISTANT_RETRY_TEXT, tone: 'danger' }, event.reason)
        case 'needs-input':
            return { icon: '💬', text: 'Reply needs your input.', tone: 'info' }
        default:
            return { icon: null, text: 'Reply finished.', tone: 'default' }
    }
}

function getLimitPresentation(event: LimitEvent): EventPresentation {
    const endsAt = typeof event.endsAt === 'number' ? event.endsAt : null
    if (event.type === 'limit-reached') {
        return {
            icon: '⏳',
            text: endsAt ? `Usage limit reached until ${formatUnixTimestamp(endsAt)}` : 'Usage limit reached',
            tone: 'warning',
        }
    }

    const percent = typeof event.percent === 'number' ? event.percent : 0
    const until = endsAt ? ` until ${formatUnixTimestamp(endsAt)}` : ''
    return { icon: '⏳', text: `Usage limit warning (${percent}%)${until}`, tone: 'warning' }
}

function formatUnknownEventType(type: string): string {
    const eventType = type.trim()
    return eventType ? `Session event: ${eventType}` : 'Session event'
}

export function getEventPresentation(event: AgentEvent): EventPresentation {
    switch (event.type) {
        case 'api-error':
            return getApiErrorPresentation(event as ApiErrorEvent)
        case 'assistant-error':
            return withDetail({ icon: '⚠️', text: ASSISTANT_RETRY_TEXT, tone: 'danger' }, event.detail)
        case 'driver-switched': {
            const targetDriver = formatSessionAgentLabel(event.targetDriver)
            return { icon: '↔️', text: targetDriver ? `Switched to ${targetDriver}` : 'Agent switched', tone: 'info' }
        }
        case 'driver-switch-send-failed':
            return getDriverSwitchSendFailedPresentation(event)
        case 'turn-terminal':
            return getTurnTerminalPresentation(event as TurnTerminalEvent)
        case 'permission-mode-changed': {
            const mode = typeof event.mode === 'string' ? event.mode : 'default'
            return { icon: '🔐', text: `Permission mode: ${mode}`, tone: 'info' }
        }
        case 'limit-reached':
        case 'limit-warning':
            return getLimitPresentation(event as LimitEvent)
        case 'message':
            return { icon: null, text: typeof event.message === 'string' ? event.message : 'Message', tone: 'default' }
        case 'turn-duration': {
            const ms = typeof event.durationMs === 'number' ? event.durationMs : 0
            return { icon: '⏱️', text: `Turn: ${formatDuration(ms)}`, tone: 'default' }
        }
        case 'microcompact': {
            const saved = typeof event.tokensSaved === 'number' ? event.tokensSaved : 0
            const formatted = saved >= 1000 ? `${Math.round(saved / 1000)}K` : String(saved)
            return { icon: '📦', text: `Context compacted (saved ${formatted} tokens)`, tone: 'success' }
        }
        case 'compact':
            return { icon: '📦', text: 'Conversation compacted', tone: 'success' }
        default:
            return { icon: null, text: formatUnknownEventType(event.type), tone: 'default' }
    }
}

export function renderEventLabel(event: AgentEvent): string {
    return getEventPresentation(event).text
}
