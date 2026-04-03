import type { AgentEvent } from '@/chat/types'

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

function formatDriverLabel(driver: unknown): string | null {
    if (driver === 'claude') {
        return 'Claude'
    }
    if (driver === 'codex') {
        return 'Codex'
    }
    if (typeof driver === 'string' && driver.trim().length > 0) {
        return driver
    }

    return null
}

export type EventPresentation = {
    icon: string | null
    text: string
    tone: 'default' | 'info' | 'success' | 'warning' | 'danger'
}

export function getEventPresentation(event: AgentEvent): EventPresentation {
    if (event.type === 'api-error') {
        const { retryAttempt, maxRetries } = event as { retryAttempt: number; maxRetries: number }
        if (maxRetries > 0 && retryAttempt >= maxRetries) {
            return { icon: '⚠️', text: 'API error: Max retries reached', tone: 'danger' }
        }
        if (maxRetries > 0) {
            return { icon: '⏳', text: `API error: Retrying (${retryAttempt}/${maxRetries})`, tone: 'warning' }
        }
        if (retryAttempt > 0) {
            return { icon: '⏳', text: 'API error: Retrying...', tone: 'warning' }
        }
        return { icon: '⚠️', text: 'API error', tone: 'warning' }
    }
    if (event.type === 'driver-switched') {
        const previousDriver = formatDriverLabel(event.previousDriver)
        const targetDriver = formatDriverLabel(event.targetDriver)
        if (previousDriver && targetDriver) {
            return { icon: '↔️', text: `${previousDriver} changed to ${targetDriver}`, tone: 'info' }
        }
        if (targetDriver) {
            return { icon: '↔️', text: `Changed to ${targetDriver}`, tone: 'info' }
        }
        return { icon: '↔️', text: 'Agent changed', tone: 'info' }
    }
    if (event.type === 'driver-switch-send-failed') {
        if (event.code === 'empty_first_turn') {
            return {
                icon: '⚠️',
                text: 'The first post-switch message was empty and was not sent.',
                tone: 'warning'
            }
        }
        if (event.code === 'timeout') {
            return {
                icon: '⚠️',
                text: 'The first post-switch message timed out before the new agent accepted it.',
                tone: 'warning'
            }
        }
        return {
            icon: '⚠️',
            text: 'The first post-switch message failed before the new agent accepted it.',
            tone: 'warning'
        }
    }
    if (event.type === 'title-changed') {
        const title = typeof event.title === 'string' ? event.title : ''
        return { icon: null, text: title ? `Title changed to "${title}"` : 'Title changed', tone: 'default' }
    }
    if (event.type === 'permission-mode-changed') {
        const modeValue = (event as Record<string, unknown>).mode
        const mode = typeof modeValue === 'string' ? modeValue : 'default'
        return { icon: '🔐', text: `Permission mode: ${mode}`, tone: 'info' }
    }
    if (event.type === 'limit-reached') {
        const endsAt = typeof event.endsAt === 'number' ? event.endsAt : null
        return {
            icon: '⏳',
            text: endsAt ? `Usage limit reached until ${formatUnixTimestamp(endsAt)}` : 'Usage limit reached',
            tone: 'warning'
        }
    }
    if (event.type === 'message') {
        return { icon: null, text: typeof event.message === 'string' ? event.message : 'Message', tone: 'default' }
    }
    if (event.type === 'turn-duration') {
        const ms = typeof event.durationMs === 'number' ? event.durationMs : 0
        return { icon: '⏱️', text: `Turn: ${formatDuration(ms)}`, tone: 'default' }
    }
    if (event.type === 'microcompact') {
        const saved = typeof event.tokensSaved === 'number' ? event.tokensSaved : 0
        const formatted = saved >= 1000 ? `${Math.round(saved / 1000)}K` : String(saved)
        return { icon: '📦', text: `Context compacted (saved ${formatted} tokens)`, tone: 'success' }
    }
    if (event.type === 'compact') {
        return { icon: '📦', text: 'Conversation compacted', tone: 'success' }
    }
    try {
        return { icon: null, text: JSON.stringify(event), tone: 'default' }
    } catch {
        return { icon: null, text: String(event.type), tone: 'default' }
    }
}

export function renderEventLabel(event: AgentEvent): string {
    return getEventPresentation(event).text
}
