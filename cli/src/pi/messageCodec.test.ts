import { describe, expect, it } from 'vitest'

import {
    buildPiAssistantOutputRecord,
    getPiAssistantStreamId,
    rehydratePiMessages
} from './messageCodec'

function createAssistantPayload(contentType: 'output' | 'codex') {
    return {
        id: `message-${contentType}`,
        seq: 1,
        localId: null,
        createdAt: 1_000,
        content: {
            role: 'agent',
            content: {
                type: contentType,
                data: {
                    type: 'assistant',
                    message: {
                        role: 'assistant',
                        api: 'pi',
                        provider: 'openai',
                        model: 'gpt-5.4-mini',
                        responseId: 'resp-1',
                        usage: {
                            input: 10,
                            output: 20,
                            cacheRead: 0,
                            cacheWrite: 0,
                            totalTokens: 30,
                            cost: {
                                input: 0,
                                output: 0,
                                cacheRead: 0,
                                cacheWrite: 0,
                                total: 0
                            }
                        },
                        stopReason: 'stop',
                        timestamp: 1_000,
                        content: [
                            { type: 'text', text: 'done' }
                        ]
                    }
                }
            }
        }
    }
}

function createToolResultPayload(contentType: 'output' | 'codex') {
    return {
        id: `tool-${contentType}`,
        seq: 2,
        localId: null,
        createdAt: 2_000,
        content: {
            role: 'agent',
            content: {
                type: contentType,
                data: {
                    type: 'user',
                    toolUseResult: {
                        role: 'toolResult',
                        toolCallId: 'tool-1',
                        toolName: 'read_file',
                        isError: false,
                        timestamp: 2_000,
                        content: [
                            { type: 'text', text: 'file content' }
                        ]
                    }
                }
            }
        }
    }
}

describe('Pi message helpers', () => {
    it('derives a stable Pi assistant stream id from timestamp when responseId is absent', () => {
        expect(getPiAssistantStreamId({
            responseId: undefined,
            timestamp: 1_000
        })).toBe('pi-assistant-1000')
    })

    it('writes the same stable Pi assistant stream id into the durable transcript wrapper', () => {
        expect(buildPiAssistantOutputRecord({
            role: 'assistant',
            api: 'pi',
            provider: 'openai',
            model: 'gpt-5.4-mini',
            usage: {
                input: 1,
                output: 1,
                cacheRead: 0,
                cacheWrite: 0,
                totalTokens: 2,
                cost: {
                    input: 0,
                    output: 0,
                    cacheRead: 0,
                    cacheWrite: 0,
                    total: 0
                }
            },
            stopReason: 'stop',
            timestamp: 1_000,
            content: [{ type: 'text', text: 'done' }]
        })).toMatchObject({
            uuid: 'pi-assistant-1000'
        })
    })
})

describe('rehydratePiMessages', () => {
    it('rehydrates Pi assistant messages from the canonical output contract', () => {
        const recovered = rehydratePiMessages([createAssistantPayload('output')])

        expect(recovered).toHaveLength(1)
        expect(recovered[0]).toMatchObject({
            role: 'assistant',
            model: 'gpt-5.4-mini',
            content: [{ type: 'text', text: 'done' }]
        })
    })

    it('rehydrates legacy Pi assistant messages from the previous codex wrapper', () => {
        const recovered = rehydratePiMessages([createAssistantPayload('codex')])

        expect(recovered).toHaveLength(1)
        expect(recovered[0]).toMatchObject({
            role: 'assistant',
            responseId: 'resp-1'
        })
    })

    it('rehydrates Pi tool results from both canonical and legacy wrappers', () => {
        const recovered = rehydratePiMessages([
            createToolResultPayload('output'),
            createToolResultPayload('codex')
        ])

        expect(recovered).toHaveLength(2)
        expect(recovered[0]).toMatchObject({
            role: 'toolResult',
            toolCallId: 'tool-1'
        })
        expect(recovered[1]).toMatchObject({
            role: 'toolResult',
            toolName: 'read_file'
        })
    })
})
