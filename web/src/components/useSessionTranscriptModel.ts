import { useEffect, useMemo, useRef } from 'react'
import { normalizeDecryptedMessage } from '@/chat/normalize'
import { buildConversationOutline } from '@/chat/outline'
import { reconcileChatBlocks } from '@/chat/reconcile'
import { reduceChatBlocks } from '@/chat/reducer'
import { resolveTextRenderMode } from '@/chat/textRenderMode'
import { buildTranscriptRenderRows, injectThinkingRenderRow } from '@/chat/transcriptRenderRows'
import { createTranscriptModel, stabilizeTranscriptRowIdentities } from '@/chat/transcriptRows'
import type { TranscriptRow } from '@/chat/transcriptTypes'
import type { ChatBlock, NormalizedMessage } from '@/chat/types'
import type { AssistantReplyingPhase } from '@/components/AssistantChat/assistantReplyingPhase'
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
    replyingPhase: AssistantReplyingPhase | null
}) {
    const { sessionId, messages, agentState, stream, replyingPhase } = options
    const normalizedCacheRef = useRef<Map<string, { source: DecryptedMessage; normalized: NormalizedMessage | null }>>(
        new Map()
    )
    const blocksByIdRef = useRef<Map<string, ChatBlock>>(new Map())
    const rowsByIdRef = useRef<Map<string, TranscriptRow>>(new Map())
    const cachedSessionIdRef = useRef<string | null>(null)
    // freshRowIds marks rows that are *appended* to the tail of the transcript
    // between two consecutive frames — new user turns, new assistant blocks, and
    // the assistant’s final answer turning a streaming row into a durable one.
    // Rows that arrive via prepend (older history loaded by reverse infinite
    // scroll), session entry, or full re-normalize must NOT be marked fresh so
    // the transcript view does not stage an enter animation for content the
    // user is scrolling backwards through. We track the full set of row ids
    // we saw last render: newly appended ids that sit past the last preserved id are
    // genuine tail appends, anything else (prepend, replacement of a row that
    // disappeared from the tail) is not fresh. Holding the whole id set lets
    // us survive `previousTail` being replaced mid-stream without falsely
    // animating every row.
    const previousRowIdsRef = useRef<Set<string>>(new Set())

    const normalizedMessages = useMemo(() => {
        if (cachedSessionIdRef.current !== sessionId) {
            cachedSessionIdRef.current = sessionId
            normalizedCacheRef.current.clear()
            blocksByIdRef.current.clear()
            rowsByIdRef.current.clear()
            previousRowIdsRef.current = new Set()
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

    const transcript = useMemo(() => {
        const model = createTranscriptModel(reconciled.blocks)
        const stableRows = stabilizeTranscriptRowIdentities(model.rows, rowsByIdRef.current)
        return {
            ...model,
            rows: stableRows,
            renderRows: buildTranscriptRenderRows(stableRows),
        }
    }, [reconciled.blocks])
    const outlineItems = useMemo(() => buildConversationOutline(transcript.rows), [transcript.rows])
    const renderRows = useMemo(
        () => injectThinkingRenderRow(transcript.renderRows, replyingPhase),
        [transcript.renderRows, replyingPhase]
    )

    // Find where the previous tail row sits in the new list. Anything past
    // that index is genuine tail-append (new turn, new assistant block, stream
    // settle). Prepend, full rebuild, and cold session entry all yield an empty
    // set, so historical rows never animate.
    const freshRowIds = useMemo(() => {
        const fresh = new Set<string>()
        const previousIds = previousRowIdsRef.current
        // Cold entry / first non-empty render must not flash-animate the entire
        // initial transcript. Only subsequent renders with a known baseline of
        // previous ids can stage append animations.
        if (previousIds.size > 0 && renderRows.length > 0) {
            // Find the right-most index where we still see a previously known
            // row. Anything beyond that index is a tail append from this
            // commit. This is robust against the previous tail row being
            // replaced mid-stream (which made the old `previousTailRowId`
            // lookup return -1 and falsely mark every row fresh).
            let lastPreservedIndex = -1
            for (let index = 0; index < renderRows.length; index += 1) {
                if (previousIds.has(renderRows[index]!.row.id)) {
                    lastPreservedIndex = index
                }
            }
            for (let index = lastPreservedIndex + 1; index < renderRows.length; index += 1) {
                fresh.add(renderRows[index]!.row.id)
            }
        }
        const nextIds = new Set<string>()
        for (const renderRow of renderRows) {
            nextIds.add(renderRow.row.id)
        }
        previousRowIdsRef.current = nextIds
        return fresh
    }, [renderRows])

    return {
        rows: transcript.rows,
        renderRows,
        freshRowIds,
        outlineItems,
        conversationIds: transcript.conversationIds,
        rowStartIndexByConversationId: transcript.rowStartIndexByConversationId,
        rawMessagesCount: messages.length,
        normalizedMessagesCount: normalizedMessages.length,
        blocks: reconciled.blocks,
    }
}
