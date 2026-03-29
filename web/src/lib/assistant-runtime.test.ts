import type { AppendMessage } from '@assistant-ui/react'
import { describe, expect, it } from 'vitest'
import {
    extractMessageContent,
    toThreadMessageLike
} from '@/lib/assistant-runtime'

describe('extractMessageContent', () => {
    it('keeps image attachments attached by reading metadata sidecars from assistant-ui content', () => {
        const message: AppendMessage = {
            role: 'user',
            createdAt: new Date('2026-03-21T02:00:00.000Z'),
            parentId: null,
            sourceId: null,
            content: [{ type: 'text', text: '看一下这张图' }],
            attachments: [{
                id: 'attachment-1',
                type: 'image',
                name: 'photo.jpg',
                contentType: 'image/jpeg',
                status: { type: 'complete' },
                content: [
                    {
                        type: 'image',
                        image: 'data:image/jpeg;base64,abc',
                        filename: 'photo.jpg'
                    },
                    {
                        type: 'text',
                        text: JSON.stringify({
                            __attachmentMetadata: {
                                id: 'attachment-1',
                                filename: 'photo.jpg',
                                mimeType: 'image/jpeg',
                                size: 1024,
                                path: '/tmp/photo.jpg',
                                previewUrl: 'data:image/jpeg;base64,abc'
                            }
                        })
                    }
                ]
            }],
            metadata: { custom: {} },
            runConfig: {}
        }

        expect(extractMessageContent(message)).toEqual({
            text: '看一下这张图',
            attachments: [{
                id: 'attachment-1',
                filename: 'photo.jpg',
                mimeType: 'image/jpeg',
                size: 1024,
                path: '/tmp/photo.jpg',
                previewUrl: 'data:image/jpeg;base64,abc'
            }]
        })
    })
})

describe('assistant runtime team metadata bridge', () => {
    it('maps team-system user messages to inline system notices', () => {
        const message = toThreadMessageLike({
            kind: 'user-text',
            id: 'message-1',
            localId: null,
            createdAt: 1_000,
            text: '用户已接管 implementer 成员',
            renderMode: 'plain',
            meta: {
                sentFrom: 'team-system',
                teamProjectId: 'project-1',
                managerSessionId: 'manager-session-1',
                memberId: 'member-1',
                sessionRole: 'manager',
                teamMessageKind: 'system-event',
                controlOwner: 'user'
            }
        })

        expect(message.role).toBe('system')
        expect(message.metadata).toMatchObject({
            custom: {
                kind: 'team-notice',
                sentFrom: 'team-system',
                memberId: 'member-1',
                sessionRole: 'manager',
                controlOwner: 'user'
            }
        })
    })

    it('keeps manager metadata on member transcript user bubbles', () => {
        const message = toThreadMessageLike({
            kind: 'user-text',
            id: 'message-2',
            localId: null,
            createdAt: 1_000,
            text: '请先看 failing test',
            renderMode: 'plain',
            meta: {
                sentFrom: 'manager',
                teamProjectId: 'project-1',
                managerSessionId: 'manager-session-1',
                memberId: 'member-1',
                sessionRole: 'member',
                teamMessageKind: 'follow-up',
                controlOwner: 'manager'
            }
        })

        expect(message.role).toBe('user')
        expect(message.metadata).toMatchObject({
            custom: {
                kind: 'user',
                sentFrom: 'manager',
                sessionRole: 'member',
                teamMessageKind: 'follow-up'
            }
        })
    })
})
