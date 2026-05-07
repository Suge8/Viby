import { asString, isObject } from '@viby/protocol'
import { isInternalEventJson } from '@/agent/internalEventFilter'
import { parseRateLimitText } from '@/agent/rateLimitParser'
import type { AgentMessage, PlanItem } from '@/agent/types'
import { deriveToolNameWithSource, isPlaceholderToolName } from '@/agent/utils'
import { extractTextContent, mergeTextChunk } from './acpMessageText'
import { deriveToolInputFromUpdate, hoistDiffContentIntoInput, normalizeAcpToolContent } from './acpToolContent'
import { ACP_SESSION_UPDATE_TYPES } from './constants'

type ToolStatus = 'pending' | 'in_progress' | 'completed' | 'failed'

function normalizeStatus(status: unknown): ToolStatus {
    if (status === 'in_progress' || status === 'completed' || status === 'failed') {
        return status
    }
    return 'pending'
}

type DerivedToolName = ReturnType<typeof deriveToolNameWithSource>

function deriveToolNameFromUpdate(update: Record<string, unknown>): DerivedToolName {
    return deriveToolNameWithSource({
        title: asString(update.title),
        kind: asString(update.kind),
        rawInput: update.rawInput,
    })
}

function normalizePlanEntries(entries: unknown): PlanItem[] {
    if (!Array.isArray(entries)) return []

    const items: PlanItem[] = []
    for (const entry of entries) {
        if (!isObject(entry)) continue
        const content = asString(entry.content)
        const priority = asString(entry.priority)
        const status = asString(entry.status)

        if (!content) continue
        if (priority !== 'high' && priority !== 'medium' && priority !== 'low') continue
        if (status !== 'pending' && status !== 'in_progress' && status !== 'completed') continue

        items.push({ content, priority, status })
    }

    return items
}

export class AcpMessageHandler {
    private readonly toolCalls = new Map<string, { name: string; input: unknown }>()
    private bufferedText = ''

    constructor(private readonly onMessage: (message: AgentMessage) => void) {}

    flushText(): void {
        if (!this.bufferedText) {
            return
        }
        const text = this.bufferedText
        this.bufferedText = ''
        this.onMessage({ type: 'text', text })
    }

    private appendTextChunk(text: string): void {
        if (text) this.bufferedText = mergeTextChunk(this.bufferedText, text)
    }

    handleUpdate(update: unknown): void {
        if (!isObject(update)) return
        const updateType = asString(update.sessionUpdate)
        if (!updateType) return

        if (updateType === ACP_SESSION_UPDATE_TYPES.agentMessageChunk) {
            const content = update.content
            const text = extractTextContent(content)
            if (text) {
                const hadBufferedPrefix = this.bufferedText !== '' && text.startsWith(this.bufferedText)
                const rateLimit = parseRateLimitText(text)
                if (rateLimit) {
                    if (hadBufferedPrefix) {
                        this.bufferedText = ''
                    }
                    if (!rateLimit.suppress) {
                        this.flushText()
                        this.onMessage(rateLimit.message)
                    }
                    return
                }
                if (isInternalEventJson(text)) {
                    if (hadBufferedPrefix) {
                        this.bufferedText = ''
                    }
                    return
                }
                this.appendTextChunk(text)
            }
            return
        }

        if (updateType === ACP_SESSION_UPDATE_TYPES.agentThoughtChunk) {
            const text = extractTextContent(update.content)
            if (text) {
                this.onMessage({ type: 'reasoning', text })
            }
            return
        }

        if (updateType === ACP_SESSION_UPDATE_TYPES.toolCall) {
            this.flushText()
            this.handleToolCall(update)
            return
        }

        if (updateType === ACP_SESSION_UPDATE_TYPES.toolCallUpdate) {
            this.handleToolCallUpdate(update)
            return
        }

        if (updateType === ACP_SESSION_UPDATE_TYPES.plan) {
            const items = normalizePlanEntries(update.entries)
            if (items.length > 0) {
                this.flushText()
                this.onMessage({ type: 'plan', items })
            }
        }
    }

    private handleToolCall(update: Record<string, unknown>): void {
        const toolCallId = asString(update.toolCallId)
        if (!toolCallId) return

        const derivedName = deriveToolNameFromUpdate(update)
        const name = derivedName.name
        const input = 'rawInput' in update ? update.rawInput : deriveToolInputFromUpdate(update)
        const status = normalizeStatus(update.status)

        this.toolCalls.set(toolCallId, { name, input })

        this.emitToolCall(toolCallId, name, input, status)
    }

    private emitToolCall(id: string, name: string, input: unknown, status: ToolStatus): void {
        this.onMessage({ type: 'tool_call', id, name, input, status })
    }

    private handleToolCallUpdate(update: Record<string, unknown>): void {
        const toolCallId = asString(update.toolCallId)
        if (!toolCallId) return

        const status = normalizeStatus(update.status)
        const existing = this.toolCalls.get(toolCallId)

        if (update.rawInput !== undefined) {
            const derivedName = deriveToolNameFromUpdate(update)
            const name = this.selectToolNameForUpdate(existing?.name ?? null, derivedName)
            const input = update.rawInput
            this.toolCalls.set(toolCallId, { name, input })
            this.emitToolCall(toolCallId, name, input, status)
        } else if (existing) {
            const fallback = existing.input == null ? deriveToolInputFromUpdate(update) : null
            const input = fallback ?? existing.input
            const name = fallback
                ? this.selectToolNameForUpdate(existing.name, deriveToolNameFromUpdate(update))
                : existing.name
            if (fallback) {
                this.toolCalls.set(toolCallId, { name, input })
            }
            if (status === 'in_progress' || status === 'pending' || fallback) {
                this.emitToolCall(toolCallId, name, input, status)
            }
        }

        if (status === 'completed' || status === 'failed') {
            if (status === 'completed' && update.rawInput == null && existing) {
                const hoisted = hoistDiffContentIntoInput(update.content)
                if (hoisted) {
                    this.toolCalls.set(toolCallId, hoisted)
                    this.emitToolCall(toolCallId, hoisted.name, hoisted.input, status)
                }
            }
            const output =
                update.rawOutput !== undefined
                    ? update.rawOutput
                    : (normalizeAcpToolContent(update.content) ?? update.content)
            this.onMessage({
                type: 'tool_result',
                id: toolCallId,
                output,
                status: status === 'failed' ? 'failed' : 'completed',
            })
        }
    }

    private selectToolNameForUpdate(existingName: string | null, derivedName: DerivedToolName): string {
        if (!existingName) {
            return derivedName.name
        }

        if (
            derivedName.source === 'title' ||
            derivedName.source === 'raw_input_name' ||
            derivedName.source === 'raw_input_tool'
        ) {
            return derivedName.name
        }

        if (isPlaceholderToolName(existingName)) {
            return derivedName.name
        }

        return existingName
    }
}
