import { describe, expect, it } from 'bun:test'
import { PairingPeerSendMessageResultSchema } from './pairingPeerRpcSchema'

const session = {
    id: 'session-1',
    seq: 1,
    createdAt: 1,
    updatedAt: 1,
    active: true,
    activeAt: 1,
    metadata: { path: '/repo', host: 'desk', driver: 'codex' },
    metadataVersion: 1,
    agentState: null,
    agentStateVersion: 0,
    thinking: true,
    thinkingAt: 1,
    model: null,
    modelReasoningEffort: null,
    codexServiceTier: null,
}

describe('PairingPeerSendMessageResultSchema', () => {
    it('requires the authoritative accepted message lifecycle', () => {
        const message = {
            id: 'message-1',
            seq: 1,
            localId: 'local-1',
            createdAt: 2,
            invokedAt: null,
            content: { role: 'user', content: { type: 'text', text: 'queued' } },
        }

        expect(PairingPeerSendMessageResultSchema.parse({ session, message }).message).toEqual(message)
        expect(PairingPeerSendMessageResultSchema.safeParse({ session }).success).toBe(false)
    })
})
