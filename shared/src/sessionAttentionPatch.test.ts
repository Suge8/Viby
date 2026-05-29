import { describe, expect, it } from 'bun:test'
import { buildSessionAttentionPatch, parseSessionAttentionPatch } from './sessionAttentionPatch'

const agentState = {
    controlledByUser: false,
    requests: {
        'request-2': { tool: 'Bash', arguments: {}, createdAt: 2 },
        'request-1': { tool: 'Read', arguments: {}, createdAt: 1 },
    },
    completedRequests: {},
}

describe('session attention patch', () => {
    it('builds a stable pending request patch from agent state', () => {
        expect(buildSessionAttentionPatch(agentState)).toEqual({
            pendingRequestsCount: 2,
            pendingRequestIds: ['request-1', 'request-2'],
        })
    })

    it('parses only complete pending request patches', () => {
        expect(parseSessionAttentionPatch({ pendingRequestsCount: 1, pendingRequestIds: ['request-1'] })).toEqual({
            pendingRequestsCount: 1,
            pendingRequestIds: ['request-1'],
        })
        expect(parseSessionAttentionPatch({ pendingRequestsCount: 1 })).toBeNull()
    })
})
