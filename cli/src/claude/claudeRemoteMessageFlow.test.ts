import { describe, expect, it, vi } from 'vitest'
import { ClaudeRemoteMessageFlow } from './claudeRemoteMessageFlow'
import type { SDKAssistantMessage, SDKMessage } from './sdk'

function createHarness() {
    const queued: unknown[] = []
    const sent: unknown[] = []
    const appended: Array<{ assistantTurnId: string; delta: string }> = []
    const cleared: string[] = []

    const flow = new ClaudeRemoteMessageFlow(
        {
            onMessage() {},
            getResponses: () => new Map(),
        } as never,
        {
            enqueue(message: unknown) {
                queued.push(message)
            },
            releaseToolCall() {},
        } as never,
        {
            convert(message: SDKMessage) {
                if (message.type !== 'assistant') {
                    return null
                }

                const assistantMessage = message as SDKAssistantMessage
                return {
                    type: 'assistant',
                    uuid: 'uuid-1',
                    sessionId: 'session-1',
                    cwd: '/tmp/project',
                    version: '1.0.0',
                    timestamp: new Date(0).toISOString(),
                    userType: 'external',
                    parentUuid: null,
                    isSidechain: false,
                    message: assistantMessage.message,
                }
            },
            convertSidechainUserMessage() {
                throw new Error('unexpected sidechain message')
            },
            generateInterruptedToolResult() {
                throw new Error('unexpected interrupted tool result')
            },
        } as never,
        (logMessage) => {
            sent.push(logMessage)
        },
        (assistantTurnId, delta) => {
            appended.push({ assistantTurnId, delta })
        },
        (assistantTurnId) => {
            if (assistantTurnId) {
                cleared.push(assistantTurnId)
            }
        }
    )

    return { flow, queued, sent, appended, cleared }
}

describe('ClaudeRemoteMessageFlow assistant stream', () => {
    it('streams only assistant text deltas and lets the durable assistant message resolve the stream', () => {
        const { flow, queued, appended, cleared } = createHarness()

        flow.handle({
            type: 'stream_event',
            event: {
                type: 'message_start',
                message: { id: 'claude-msg-1' },
            },
        })
        flow.handle({
            type: 'stream_event',
            event: {
                type: 'content_block_delta',
                delta: { type: 'text_delta', text: 'Hello' },
            },
        })
        flow.handle({
            type: 'assistant',
            message: {
                id: 'claude-msg-1',
                role: 'assistant',
                content: [{ type: 'text', text: 'Hello' }],
            },
        })
        flow.flushDanglingAssistantStream()

        expect(appended).toEqual([{ assistantTurnId: 'claude-msg-1', delta: 'Hello' }])
        expect(queued).toHaveLength(1)
        expect(cleared).toEqual([])
    })

    it('acknowledges tool-only durable Claude turns and avoids orphan clears', () => {
        const { flow, appended, cleared } = createHarness()

        flow.handle({
            type: 'stream_event',
            event: {
                type: 'message_start',
                message: { id: 'claude-msg-tool-1' },
            },
        })
        flow.handle({
            type: 'stream_event',
            event: {
                type: 'content_block_delta',
                delta: { type: 'text_delta', text: '.' },
            },
        })
        flow.handle({
            type: 'assistant',
            message: {
                id: 'claude-msg-tool-1',
                role: 'assistant',
                content: [{ type: 'tool_use', id: 'tool-1', name: 'Bash', input: {} }],
            },
        })
        flow.flushDanglingAssistantStream()

        expect(appended).toEqual([{ assistantTurnId: 'claude-msg-tool-1', delta: '.' }])
        expect(cleared).toEqual([])
    })

    it('clears a dangling assistant stream when Claude exits before emitting the durable assistant message', () => {
        const { flow, appended, cleared } = createHarness()

        flow.handle({
            type: 'stream_event',
            event: {
                type: 'message_start',
                message: { id: 'claude-msg-2' },
            },
        })
        flow.handle({
            type: 'stream_event',
            event: {
                type: 'content_block_delta',
                delta: { type: 'text_delta', text: 'Partial' },
            },
        })
        flow.flushDanglingAssistantStream()

        expect(appended).toEqual([{ assistantTurnId: 'claude-msg-2', delta: 'Partial' }])
        expect(cleared).toEqual(['claude-msg-2'])
    })
})
