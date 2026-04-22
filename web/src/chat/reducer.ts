import { dedupeAgentEvents, foldApiErrorEvents } from '@/chat/reducerEvents'
import { reduceTimeline } from '@/chat/reducerTimeline'
import {
    collectRemovedTitleToolIds,
    collectToolIdsFromMessages,
    ensureToolBlock,
    getPermissions,
} from '@/chat/reducerTools'
import { type TracedMessage, traceMessages } from '@/chat/tracer'
import type { ChatBlock, NormalizedMessage, UsageData } from '@/chat/types'
import type { AgentState } from '@/types/api'

// Calculate context size from usage data
function calculateContextSize(usage: UsageData): number {
    return (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0) + usage.input_tokens
}

export type LatestUsage = {
    inputTokens: number
    outputTokens: number
    cacheCreation: number
    cacheRead: number
    contextSize: number
    timestamp: number
}

function stripRemovedTitleToolArtifacts(messages: NormalizedMessage[]): NormalizedMessage[] {
    const removedToolIds = collectRemovedTitleToolIds(messages)
    if (removedToolIds.size === 0) {
        return messages
    }

    const sanitizedMessages: NormalizedMessage[] = []
    for (const message of messages) {
        if (message.role !== 'agent') {
            sanitizedMessages.push(message)
            continue
        }

        const content = message.content.filter((item) => {
            if (item.type === 'tool-call') {
                return !removedToolIds.has(item.id)
            }
            if (item.type === 'tool-result') {
                return !removedToolIds.has(item.tool_use_id)
            }
            return true
        })

        if (content.length === 0) {
            continue
        }

        sanitizedMessages.push(content.length === message.content.length ? message : { ...message, content })
    }

    return sanitizedMessages
}

export function reduceChatBlocks(
    normalized: NormalizedMessage[],
    agentState: AgentState | null | undefined
): { blocks: ChatBlock[]; hasReadyEvent: boolean; latestUsage: LatestUsage | null } {
    const sanitizedMessages = stripRemovedTitleToolArtifacts(normalized)
    const permissionsById = getPermissions(agentState)
    const toolIdsInMessages = collectToolIdsFromMessages(sanitizedMessages)

    const traced = traceMessages(sanitizedMessages)
    const groups = new Map<string, TracedMessage[]>()
    const root: TracedMessage[] = []

    for (const msg of traced) {
        if (msg.sidechainId) {
            const existing = groups.get(msg.sidechainId) ?? []
            existing.push(msg)
            groups.set(msg.sidechainId, existing)
        } else {
            root.push(msg)
        }
    }

    const consumedGroupIds = new Set<string>()
    const reducerContext = { permissionsById, groups, consumedGroupIds }
    const rootResult = reduceTimeline(root, reducerContext)
    let hasReadyEvent = rootResult.hasReadyEvent

    // Only create permission-only tool cards when there is no tool call/result in the transcript.
    // Also skip if the permission is older than the oldest message in the current view,
    // to avoid mixing old tool cards with newer messages when paginating.
    const oldestMessageTime =
        sanitizedMessages.length > 0 ? Math.min(...sanitizedMessages.map((m) => m.createdAt)) : null

    for (const [id, entry] of permissionsById) {
        if (toolIdsInMessages.has(id)) continue
        if (rootResult.toolBlocksById.has(id)) continue

        const createdAt = entry.permission.createdAt ?? Date.now()

        // Skip permissions that are older than the oldest message in the current view.
        // These will be shown when the user loads older messages.
        if (oldestMessageTime !== null && createdAt < oldestMessageTime) {
            continue
        }

        const block = ensureToolBlock(rootResult.blocks, rootResult.toolBlocksById, id, {
            createdAt,
            localId: null,
            name: entry.toolName,
            input: entry.input,
            description: null,
            permission: entry.permission,
        })

        if (entry.permission.status === 'approved') {
            block.tool.state = 'completed'
            block.tool.completedAt = entry.permission.completedAt ?? createdAt
            if (block.tool.result === undefined) {
                block.tool.result = 'Approved'
            }
        } else if (entry.permission.status === 'denied' || entry.permission.status === 'canceled') {
            block.tool.state = 'error'
            block.tool.completedAt = entry.permission.completedAt ?? createdAt
            if (block.tool.result === undefined && entry.permission.reason) {
                block.tool.result = { error: entry.permission.reason }
            }
        }
    }

    // Calculate latest usage from messages (find the most recent message with usage data)
    let latestUsage: LatestUsage | null = null
    for (let i = sanitizedMessages.length - 1; i >= 0; i--) {
        const msg = sanitizedMessages[i]
        if (msg.usage) {
            latestUsage = {
                inputTokens: msg.usage.input_tokens,
                outputTokens: msg.usage.output_tokens,
                cacheCreation: msg.usage.cache_creation_input_tokens ?? 0,
                cacheRead: msg.usage.cache_read_input_tokens ?? 0,
                contextSize: calculateContextSize(msg.usage),
                timestamp: msg.createdAt,
            }
            break
        }
    }

    return { blocks: dedupeAgentEvents(foldApiErrorEvents(rootResult.blocks)), hasReadyEvent, latestUsage }
}
