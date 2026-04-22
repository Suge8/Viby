import { logger } from '@/ui/logger'
import type { EnhancedMode } from './loop'
import type { CodexSession } from './session'

export const TURN_CONTENT_EVENT_TYPES = new Set([
    'agent_message_delta',
    'agent_message',
    'plan_proposal',
    'agent_reasoning',
    'agent_reasoning_delta',
    'agent_reasoning_section_break',
    'plan_update',
    'exec_command_begin',
    'exec_command_end',
])

export const TERMINAL_EVENT_TYPES = new Set(['task_complete', 'turn_aborted', 'task_failed'])

const ABORT_SUPPRESSED_NOTIFICATION_METHODS = new Set([
    'turn/diff/updated',
    'codex/event/item_started',
    'codex/event/item_completed',
    'codex/event/agent_message_delta',
    'codex/event/agent_message_content_delta',
    'codex/event/reasoning_content_delta',
    'codex/event/agent_reasoning_section_break',
    'codex/event/agent_reasoning_delta',
    'codex/event/agent_reasoning',
    'codex/event/agent_message',
    'codex/event/exec_command_output_delta',
])

export const RUNNER_RESUME_WARMUP_MAX_ATTEMPTS = 3
const RUNNER_RESUME_WARMUP_RETRY_BASE_DELAY_MS = 250

export type QueuedMessage = { message: string; mode: EnhancedMode; isolate: boolean; hash: string }

export type CodexRemoteRuntimeState = {
    currentThreadId: string | null
    currentTurnId: string | null
    suppressedTurnIds: string[]
    suppressAnonymousTurnEvents: boolean
    turnInFlight: boolean
    allowAnonymousTerminalEvent: boolean
}

export function isAbortSuppressedNotificationMethod(method: string): boolean {
    if (method.startsWith('item/')) {
        return true
    }

    return ABORT_SUPPRESSED_NOTIFICATION_METHODS.has(method)
}

export function hasExplicitTurnContext(options: { turnInFlight: boolean; currentTurnId: string | null }): boolean {
    return options.turnInFlight || options.currentTurnId !== null
}

export function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

export function requiresSynchronousResumeWarmup(session: CodexSession): boolean {
    return session.startedBy === 'runner' && typeof session.sessionId === 'string'
}

export function getResumeWarmupRetryDelayMs(attempt: number): number {
    return attempt * RUNNER_RESUME_WARMUP_RETRY_BASE_DELAY_MS
}

export function shouldRetryResumeWarmup(options: {
    requiresResumeWarmup: boolean
    attempt: number
    maxAttempts: number
}): boolean {
    return options.requiresResumeWarmup && options.attempt < options.maxAttempts
}

export function normalizeCommand(value: unknown): string | undefined {
    if (typeof value === 'string') {
        const trimmed = value.trim()
        return trimmed.length > 0 ? trimmed : undefined
    }
    if (Array.isArray(value)) {
        const joined = value.filter((part): part is string => typeof part === 'string').join(' ')
        return joined.length > 0 ? joined : undefined
    }
    return undefined
}

export function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object') {
        return null
    }
    return value as Record<string, unknown>
}

export function asString(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null
}

export function extractNotificationThreadId(value: unknown): string | null {
    const record = asRecord(value)
    if (!record) {
        return null
    }

    const direct = asString(record.threadId ?? record.thread_id)
    if (direct) {
        return direct
    }

    const thread = asRecord(record.thread)
    const threadId = asString(thread?.threadId ?? thread?.thread_id ?? thread?.id)
    if (threadId) {
        return threadId
    }

    const item = asRecord(record.item)
    const itemThreadId = asString(item?.threadId ?? item?.thread_id ?? asRecord(item?.thread)?.id)
    if (itemThreadId) {
        return itemThreadId
    }

    const msg = asRecord(record.msg)
    const msgThreadId = asString(msg?.threadId ?? msg?.thread_id)
    if (msgThreadId) {
        return msgThreadId
    }

    const msgItem = asRecord(msg?.item)
    return asString(msgItem?.threadId ?? msgItem?.thread_id ?? asRecord(msgItem?.thread)?.id)
}

export function buildMcpToolName(server: unknown, tool: unknown): string | null {
    const serverName = asString(server)
    const toolName = asString(tool)
    if (!serverName || !toolName) {
        return null
    }
    return `mcp__${serverName}__${toolName}`
}

export function formatOutputPreview(value: unknown): string {
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    if (value === null || value === undefined) return ''
    try {
        return JSON.stringify(value)
    } catch {
        return String(value)
    }
}

export function rememberSuppressedTurn(state: CodexRemoteRuntimeState, turnId: string): void {
    state.suppressedTurnIds = state.suppressedTurnIds.filter((entry) => entry !== turnId)
    state.suppressedTurnIds.push(turnId)
    if (state.suppressedTurnIds.length > 8) {
        state.suppressedTurnIds.shift()
    }
}

export function shouldIgnoreTurnContentEvent(
    state: CodexRemoteRuntimeState,
    msgType: string,
    eventTurnId: string | null
): boolean {
    if (!TURN_CONTENT_EVENT_TYPES.has(msgType)) {
        return false
    }

    if (state.suppressAnonymousTurnEvents) {
        if (!eventTurnId) {
            logger.debug(`[Codex] Ignoring anonymous ${msgType} while abort suppression is active`)
            return true
        }

        if (!state.currentTurnId || eventTurnId === state.currentTurnId) {
            logger.debug(`[Codex] Ignoring ${msgType} for in-flight aborted turn ${eventTurnId}`)
            return true
        }
    }

    if (eventTurnId && state.suppressedTurnIds.includes(eventTurnId)) {
        logger.debug(`[Codex] Ignoring ${msgType} for suppressed turn ${eventTurnId}`)
        return true
    }

    if (eventTurnId && state.currentTurnId && eventTurnId !== state.currentTurnId) {
        logger.debug(`[Codex] Ignoring ${msgType} for non-current turn ${eventTurnId}; active=${state.currentTurnId}`)
        return true
    }

    return false
}

export function logActiveHandles(tag: string): void {
    if (!process.env.DEBUG) return
    const debugProcess = process as NodeJS.Process & {
        _getActiveHandles?: () => unknown[]
        _getActiveRequests?: () => unknown[]
    }
    const handles = typeof debugProcess._getActiveHandles === 'function' ? debugProcess._getActiveHandles() : []
    const requests = typeof debugProcess._getActiveRequests === 'function' ? debugProcess._getActiveRequests() : []
    logger.debug(`[codex][handles] ${tag}: handles=${handles.length} requests=${requests.length}`)
    try {
        const kinds = handles.map((handle) => {
            if (handle && typeof handle === 'object' && 'constructor' in handle) {
                const ctor = (handle as { constructor?: { name?: string } }).constructor
                return typeof ctor?.name === 'string' ? ctor.name : 'object'
            }
            return typeof handle
        })
        logger.debug(`[codex][handles] kinds=${JSON.stringify(kinds)}`)
    } catch {}
}
