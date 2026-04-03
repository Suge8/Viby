import { describe, expect, it } from 'bun:test'
import {
    buildPiAssistantStreamId,
    extractAssistantMessageStreamId,
    unwrapRoleWrappedRecordEnvelope
} from './messages'

describe('messages helpers', () => {
    it('keeps the canonical role-wrapped envelope contract', () => {
        expect(unwrapRoleWrappedRecordEnvelope({
            role: 'agent',
            content: { type: 'output' }
        })).toEqual({
            role: 'agent',
            content: { type: 'output' }
        })
    })

    it('extracts codex assistant stream ids from durable transcript records', () => {
        expect(extractAssistantMessageStreamId({
            role: 'agent',
            content: {
                type: 'codex',
                data: {
                    type: 'message',
                    itemId: 'codex-stream-1'
                }
            }
        })).toBe('codex-stream-1')
    })

    it('derives Pi assistant stream ids from durable transcript records', () => {
        expect(extractAssistantMessageStreamId({
            role: 'agent',
            content: {
                type: 'output',
                data: {
                    type: 'assistant',
                    message: {
                        responseId: undefined,
                        timestamp: 1_000
                    }
                }
            }
        })).toBe('pi-assistant-1000')
    })

    it('prefers explicit Pi response ids when available', () => {
        expect(buildPiAssistantStreamId('resp-1', 1_000)).toBe('resp-1')
    })
})
