import { describe, expect, it } from 'bun:test'

import {
    buildSessionHandoffSnapshot,
    formatSessionHandoffPrompt,
    SessionHandoffContractError,
} from './sessionHandoff'
import type { DecryptedMessage, Session } from './types'

function createSession(overrides: Partial<Session> = {}): Session {
    return {
        id: 'session-1',
        seq: 1,
        createdAt: 1,
        updatedAt: 2,
        active: true,
        activeAt: 2,
        metadata: {
            path: '/repo',
            host: 'machine',
            driver: 'codex',
            runtimeHandles: {
                codex: { sessionId: 'provider-session' },
            },
            codexSessionId: 'legacy-provider-session',
        },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 0,
        thinking: false,
        thinkingAt: 0,
        model: 'gpt-5',
        modelReasoningEffort: 'high',
        permissionMode: 'safe-yolo',
        collaborationMode: 'plan',
        ...overrides,
    }
}

function createMessage(overrides: Partial<DecryptedMessage> = {}): DecryptedMessage {
    return {
        id: 'message-1',
        seq: 1,
        localId: null,
        createdAt: 10,
        content: {
            role: 'user',
            content: {
                type: 'text',
                text: 'hello',
            },
        },
        ...overrides,
    }
}

describe('buildSessionHandoffSnapshot', () => {
    it('projects provider-agnostic continuity without leaking runtime handles or resume tokens', () => {
        const snapshot = buildSessionHandoffSnapshot(createSession(), [
            createMessage(),
            createMessage({
                id: 'message-2',
                seq: 2,
                createdAt: 20,
                content: {
                    role: 'agent',
                    content: {
                        type: 'text',
                        text: 'done',
                    },
                },
            }),
        ])

        expect(snapshot).toEqual({
            driver: 'codex',
            workingDirectory: '/repo',
            liveConfig: {
                model: 'gpt-5',
                modelReasoningEffort: 'high',
                permissionMode: 'safe-yolo',
                collaborationMode: 'plan',
            },
            history: [
                {
                    id: 'message-1',
                    seq: 1,
                    createdAt: 10,
                    role: 'user',
                    text: 'hello',
                },
                {
                    id: 'message-2',
                    seq: 2,
                    createdAt: 20,
                    role: 'assistant',
                    text: 'done',
                },
            ],
            attachments: [],
        })
        expect(JSON.stringify(snapshot)).not.toContain('runtimeHandles')
        expect(JSON.stringify(snapshot)).not.toContain('provider-session')
        expect(JSON.stringify(snapshot)).not.toContain('legacy-provider-session')
    })

    it('formats a private continuity prompt from the authoritative handoff snapshot', () => {
        const snapshot = buildSessionHandoffSnapshot(createSession(), [
            createMessage(),
            createMessage({
                id: 'message-2',
                seq: 2,
                createdAt: 20,
                content: {
                    role: 'agent',
                    content: {
                        type: 'text',
                        text: 'done',
                    },
                },
            }),
        ])

        const prompt = formatSessionHandoffPrompt(snapshot)

        expect(prompt).toContain('Private continuity handoff for a driver switch inside the same Viby session.')
        expect(prompt).toContain('"previousDriver": "codex"')
        expect(prompt).toContain('"workingDirectory": "/repo"')
        expect(prompt).toContain('"text": "hello"')
        expect(prompt).toContain('"text": "done"')
    })

    it('deduplicates attachment continuity by path and preserves attachment-only turns', () => {
        const attachment = {
            id: 'att-1',
            filename: 'spec.txt',
            mimeType: 'text/plain',
            size: 12,
            path: '/repo/spec.txt',
            previewUrl: '/preview/spec.txt',
        }

        const snapshot = buildSessionHandoffSnapshot(createSession(), [
            createMessage({
                content: {
                    role: 'user',
                    content: {
                        type: 'text',
                        text: '',
                        attachments: [attachment],
                    },
                },
            }),
            createMessage({
                id: 'message-2',
                seq: 2,
                createdAt: 20,
                content: {
                    role: 'user',
                    content: {
                        type: 'other',
                        attachments: [attachment],
                    },
                },
            }),
        ])

        expect(snapshot.history).toEqual([
            {
                id: 'message-1',
                seq: 1,
                createdAt: 10,
                role: 'user',
                text: '',
                attachmentPaths: ['/repo/spec.txt'],
            },
            {
                id: 'message-2',
                seq: 2,
                createdAt: 20,
                role: 'user',
                text: '',
                attachmentPaths: ['/repo/spec.txt'],
            },
        ])
        expect(snapshot.attachments).toEqual([
            {
                filename: 'spec.txt',
                mimeType: 'text/plain',
                path: '/repo/spec.txt',
                size: 12,
            },
        ])
    })

    it('uses the explicit driver from metadata when building the handoff snapshot', () => {
        const snapshot = buildSessionHandoffSnapshot(createSession({
            metadata: {
                path: '/legacy',
                host: 'machine',
                driver: 'claude',
                claudeSessionId: 'legacy-claude-session',
            },
            model: null,
            modelReasoningEffort: null,
            permissionMode: undefined,
            collaborationMode: undefined,
        }), [])

        expect(snapshot.driver).toBe('claude')
        expect(snapshot.workingDirectory).toBe('/legacy')
        expect(snapshot.liveConfig).toEqual({
            model: null,
            modelReasoningEffort: null,
            permissionMode: undefined,
            collaborationMode: undefined,
        })
    })

    it('ignores ready events and unknown message envelopes instead of inventing transcript turns', () => {
        const snapshot = buildSessionHandoffSnapshot(createSession(), [
            createMessage({
                content: {
                    role: 'agent',
                    content: {
                        type: 'event',
                        data: { type: 'ready' },
                    },
                },
            }),
            createMessage({
                id: 'message-2',
                seq: 2,
                createdAt: 20,
                content: { other: 'shape' },
            }),
        ])

        expect(snapshot.history).toEqual([])
        expect(snapshot.attachments).toEqual([])
    })

    it('projects canonical output assistant text and tool summaries into handoff history', () => {
        const snapshot = buildSessionHandoffSnapshot(createSession(), [
            createMessage({
                content: {
                    role: 'agent',
                    content: {
                        type: 'output',
                        data: {
                            type: 'assistant',
                            message: {
                                content: [
                                    { type: 'text', text: 'done' },
                                    { type: 'toolCall', id: 'tool-1', name: 'read_file', arguments: { path: 'README.md' } },
                                ]
                            }
                        }
                    },
                },
            }),
            createMessage({
                id: 'message-2',
                seq: 2,
                createdAt: 20,
                content: {
                    role: 'agent',
                    content: {
                        type: 'output',
                        data: {
                            type: 'user',
                            message: {
                                content: [
                                    {
                                        type: 'tool_result',
                                        tool_use_id: 'tool-1',
                                        content: [{ type: 'text', text: 'README contents' }]
                                    }
                                ]
                            },
                            toolUseResult: {
                                toolName: 'read_file',
                                content: [{ type: 'text', text: 'README contents' }]
                            }
                        }
                    },
                },
            }),
        ])

        expect(snapshot.history).toEqual([
            {
                id: 'message-1',
                seq: 1,
                createdAt: 10,
                role: 'assistant',
                text: 'done\n\nTool call: read_file',
            },
            {
                id: 'message-2',
                seq: 2,
                createdAt: 20,
                role: 'assistant',
                text: 'README contents',
            },
        ])
    })

    it('fails explicitly when metadata is missing a truthful working directory', () => {
        expect(() => buildSessionHandoffSnapshot(createSession({ metadata: null }), [])).toThrow(
            expect.objectContaining({
                name: 'SessionHandoffContractError',
                code: 'session_metadata_missing',
                field: 'metadata',
            })
        )

        expect(() => buildSessionHandoffSnapshot(createSession({
            metadata: {
                host: 'machine',
                driver: 'codex',
            } as never,
        }), [])).toThrow(expect.objectContaining({
            code: 'working_directory_missing',
            field: 'metadata.path',
        }))
    })

    it('fails explicitly for unknown or missing driver context', () => {
        expect(() => buildSessionHandoffSnapshot(createSession({
            metadata: {
                path: '/repo',
                host: 'machine',
                driver: 'unknown',
            } as never,
        }), [])).toThrow(expect.objectContaining({
            code: 'driver_context_missing',
            field: 'metadata.driver',
        }))

        expect(() => buildSessionHandoffSnapshot(createSession({
            metadata: {
                path: '/repo',
                host: 'machine',
            } as never,
        }), [])).toThrow(expect.objectContaining({
            code: 'driver_context_missing',
            field: 'metadata.driver',
        }))
    })

    it('fails explicitly when transcript text or attachment payloads are malformed', () => {
        try {
            buildSessionHandoffSnapshot(createSession(), [
                createMessage({
                    content: {
                        role: 'agent',
                        content: {
                            type: 'text',
                            text: 42,
                        },
                    } as never,
                }),
            ])
            throw new Error('expected handoff projection to fail')
        } catch (error) {
            expect(error).toBeInstanceOf(SessionHandoffContractError)
            expect(error).toMatchObject({
                code: 'transcript_message_invalid',
                field: 'messages[0].content.text',
            })
        }

        try {
            buildSessionHandoffSnapshot(createSession(), [
                createMessage({
                    content: {
                        role: 'user',
                        content: {
                            type: 'text',
                            text: 'hello',
                            attachments: [{ path: '/repo/spec.txt' }],
                        },
                    },
                }),
            ])
            throw new Error('expected handoff projection to fail')
        } catch (error) {
            expect(error).toBeInstanceOf(SessionHandoffContractError)
            expect(error).toMatchObject({
                code: 'attachment_payload_invalid',
                field: 'messages[0].content.attachments[0]',
            })
            expect(String(error)).not.toContain('/repo/spec.txt')
        }
    })
})
