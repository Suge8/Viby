import { describe, expect, it } from 'bun:test'
import type { Session } from '@viby/protocol/types'
import type { SessionCache } from './sessionCache'
import { waitForResumedSessionContractState } from './sessionSpawnSupportRuntime'
import type { ResumeContractState } from './sessionSpawnSupportTypes'

describe('waitForResumedSessionContractState', () => {
    it('waits for the expected resume token after an active patch carries a stale token', async () => {
        let currentSession = sessionWithResumeToken('old-token')
        const sessionCache = waitCache(async (resolveValue) => {
            currentSession = sessionWithResumeToken('expected-token')
            return resolveValue() ?? 'timeout'
        })

        const result = await waitForResumedSessionContractState({
            getSession: () => currentSession,
            sessionCache,
            sessionId: 'session-1',
            resumeToken: 'expected-token',
            timeoutMs: 15_000,
        })

        expect(result).toBe('ready')
    })

    it('reports token mismatch only after the expected token never arrives', async () => {
        const currentSession = sessionWithResumeToken('wrong-token')
        const sessionCache = waitCache(async (_resolveValue, onTimeout) => onTimeout())

        const result = await waitForResumedSessionContractState({
            getSession: () => currentSession,
            sessionCache,
            sessionId: 'session-1',
            resumeToken: 'expected-token',
            timeoutMs: 15_000,
        })

        expect(result).toBe('token_mismatch')
    })
})

function sessionWithResumeToken(token: string): Session {
    return {
        id: 'session-1',
        active: true,
        metadata: {
            driver: 'codex',
            runtimeHandles: {
                codex: { sessionId: token },
            },
        },
    } as Session
}

function waitCache(
    waitForState: (
        resolveValue: () => ResumeContractState | null,
        onTimeout: () => ResumeContractState
    ) => Promise<ResumeContractState>
): SessionCache {
    return {
        waitForSessionCondition: async (
            _sessionId: string,
            options: {
                onTimeout: () => ResumeContractState
                resolveValue: () => ResumeContractState | null
            }
        ) => waitForState(options.resolveValue, options.onTimeout),
    } as unknown as SessionCache
}
