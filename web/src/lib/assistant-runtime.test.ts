import type { AppendMessage } from '@assistant-ui/react'
import { describe, expect, it } from 'vitest'
import { extractMessageContent } from '@/lib/assistant-runtime'

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
