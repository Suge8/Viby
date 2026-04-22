import { describe, expect, it } from 'bun:test'
import {
    buildPiAssistantTurnId,
    extractAssistantTurnId,
    isHiddenAgentMetaOutput,
    isSystemInjectedPseudoUserText,
    sanitizeDurableAttachmentMetadata,
    sanitizeDurableAttachmentPreviewUrl,
    unwrapRoleWrappedRecordEnvelope,
} from './messages'

describe('messages helpers', () => {
    it('keeps the canonical role-wrapped envelope contract', () => {
        expect(
            unwrapRoleWrappedRecordEnvelope({
                role: 'agent',
                content: { type: 'output' },
            })
        ).toEqual({
            role: 'agent',
            content: { type: 'output' },
        })
    })

    it('extracts canonical assistant turn ids from durable transcript metadata', () => {
        expect(
            extractAssistantTurnId({
                role: 'agent',
                content: { type: 'output' },
                meta: { assistantTurnId: 'assistant-turn-1' },
            })
        ).toBe('assistant-turn-1')
    })

    it('ignores messages without canonical assistant turn metadata', () => {
        expect(extractAssistantTurnId({ role: 'agent', content: { type: 'output' } })).toBeNull()
    })

    it('prefers explicit Pi response ids when available', () => {
        expect(buildPiAssistantTurnId('resp-1', 1_000)).toBe('resp-1')
    })

    it('derives Pi assistant turn ids from timestamps when responseId is absent', () => {
        expect(buildPiAssistantTurnId(undefined, 1_000)).toBe('pi-assistant-1000')
    })

    it('detects system-injected pseudo-user transcript text', () => {
        expect(isSystemInjectedPseudoUserText('<system-reminder>internal</system-reminder>')).toBe(true)
        expect(isSystemInjectedPseudoUserText('hello world')).toBe(false)
    })

    it('detects hidden agent meta outputs', () => {
        expect(
            isHiddenAgentMetaOutput({
                role: 'agent',
                content: {
                    type: 'output',
                    data: {
                        type: 'summary',
                        summary: 'Recovered title',
                        isMeta: true,
                    },
                },
            })
        ).toBe(true)
        expect(
            isHiddenAgentMetaOutput({
                role: 'agent',
                content: {
                    type: 'output',
                    data: {
                        type: 'assistant',
                    },
                },
            })
        ).toBe(false)
    })

    it('drops data-url attachment previews from durable transcript metadata', () => {
        expect(sanitizeDurableAttachmentPreviewUrl('data:image/png;base64,abc')).toBeUndefined()
        expect(sanitizeDurableAttachmentPreviewUrl('/preview/photo.png')).toBe('/preview/photo.png')
    })

    it('keeps durable attachment metadata but strips illegal inline previews', () => {
        expect(
            sanitizeDurableAttachmentMetadata({
                id: 'attachment-1',
                filename: 'photo.png',
                mimeType: 'image/png',
                size: 123,
                path: '/tmp/photo.png',
                previewUrl: 'data:image/png;base64,abc',
            })
        ).toEqual({
            id: 'attachment-1',
            filename: 'photo.png',
            mimeType: 'image/png',
            size: 123,
            path: '/tmp/photo.png',
        })
    })
})
