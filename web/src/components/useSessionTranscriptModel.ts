import { useEffect, useMemo, useRef } from 'react'
import { normalizeDecryptedMessage } from '@/chat/normalize'
import { reconcileChatBlocks } from '@/chat/reconcile'
import { reduceChatBlocks } from '@/chat/reducer'
import { resolveTextRenderMode } from '@/chat/textRenderMode'
import { createTranscriptModel } from '@/chat/transcriptRows'
import type { ChatBlock, NormalizedMessage } from '@/chat/types'
import type { DecryptedMessage, Session, SessionStreamState } from '@/types/api'

function buildSessionStreamBlock(stream: SessionStreamState): ChatBlock {
    return {
        kind: 'agent-text',
        id: `stream:${stream.assistantTurnId}`,
        localId: null,
        createdAt: stream.startedAt,
        text: stream.text,
        renderMode: resolveTextRenderMode(stream.text),
    }
}

export function useSessionTranscriptModel(options: {
    sessionId: string
    messages: DecryptedMessage[]
    agentState: Session['agentState']
    stream: SessionStreamState | null
}) {
    const { sessionId, messages, agentState, stream } = options
    const normalizedCacheRef = useRef<Map<string, { source: DecryptedMessage; normalized: NormalizedMessage | null }>>(
        new Map()
    )
    const blocksByIdRef = useRef<Map<string, ChatBlock>>(new Map())
    const cachedSessionIdRef = useRef<string | null>(null)

    const normalizedMessages = useMemo(() => {
        if (cachedSessionIdRef.current !== sessionId) {
            cachedSessionIdRef.current = sessionId
            normalizedCacheRef.current.clear()
            blocksByIdRef.current.clear()
        }

        const cache = normalizedCacheRef.current
        const normalized: NormalizedMessage[] = []
        const seen = new Set<string>()

        for (const message of messages) {
            seen.add(message.id)
            const cached = cache.get(message.id)
            if (cached && cached.source === message) {
                if (cached.normalized) {
                    normalized.push(cached.normalized)
                }
                continue
            }

            const next = normalizeDecryptedMessage(message)
            cache.set(message.id, { source: message, normalized: next })
            if (next) {
                normalized.push(next)
            }
        }

        for (const id of cache.keys()) {
            if (!seen.has(id)) {
                cache.delete(id)
            }
        }

        return normalized
    }, [messages, sessionId])

    const reduced = useMemo(() => reduceChatBlocks(normalizedMessages, agentState), [agentState, normalizedMessages])

    const sessionStreamBlock = useMemo(() => {
        if (!stream || stream.text.length === 0) {
            return null
        }

        return buildSessionStreamBlock(stream)
    }, [stream])

    const blocksWithStream = useMemo(() => {
        if (!sessionStreamBlock) {
            return reduced.blocks
        }

        return [...reduced.blocks, sessionStreamBlock]
    }, [reduced.blocks, sessionStreamBlock])

    const reconciled = useMemo(() => reconcileChatBlocks(blocksWithStream, blocksByIdRef.current), [blocksWithStream])

    useEffect(() => {
        blocksByIdRef.current = reconciled.byId
    }, [reconciled.byId])

    const transcript = useMemo(() => createTranscriptModel(reconciled.blocks), [reconciled.blocks])

    return {
        rows: transcript.rows,
        renderRows: transcript.renderRows,
        conversationIds: transcript.conversationIds,
        rowStartIndexByConversationId: transcript.rowStartIndexByConversationId,
        historyJumpTargetConversationIds: transcript.historyJumpTargetConversationIds,
        rawMessagesCount: messages.length,
        normalizedMessagesCount: normalizedMessages.length,
        blocks: reconciled.blocks,
    }
}
