import { describe, expect, it } from 'bun:test'
import {
    getSessionDriverResumeToken,
    getSessionDriverRuntimeHandle,
    getSessionDriverRuntimeHandles,
    resolveSessionDriver,
    setSessionDriverRuntimeHandle,
    supportsSessionContinuityResume,
} from './sessionDriver'

describe('sessionDriver', () => {
    it('uses metadata.driver as the authoritative driver and reads the matching runtime handle', () => {
        const metadata = {
            driver: 'codex',
            runtimeHandles: {
                claude: { sessionId: 'claude-session' },
                codex: { sessionId: 'codex-session' },
            },
        } as never

        expect(resolveSessionDriver(metadata)).toBe('codex')
        expect(getSessionDriverRuntimeHandle(metadata)).toEqual({ sessionId: 'codex-session' })
        expect(getSessionDriverResumeToken(metadata)).toBe('codex-session')
    })

    it('does not invent a resume token when runtime handles are absent', () => {
        const metadata = {
            driver: 'gemini',
        } as never

        expect(resolveSessionDriver(metadata)).toBe('gemini')
        expect(getSessionDriverRuntimeHandle(metadata)).toBeUndefined()
        expect(getSessionDriverResumeToken(metadata)).toBeUndefined()
    })

    it('treats malformed runtime handle maps as absent instead of guessing', () => {
        const metadata = {
            driver: 'codex',
            runtimeHandles: {
                codex: { sessionId: 42 },
                claude: 'bad-shape',
            },
        } as never

        expect(getSessionDriverRuntimeHandles(metadata)).toBeUndefined()
        expect(getSessionDriverRuntimeHandle(metadata)).toBeUndefined()
        expect(getSessionDriverResumeToken(metadata)).toBeUndefined()
    })

    it('returns null for unknown or missing drivers', () => {
        expect(resolveSessionDriver(null)).toBeNull()
        expect(resolveSessionDriver({ driver: 'unknown' } as never)).toBeNull()
    })

    it('treats runner-managed Viby sessions as continuity-resumable even without provider handles', () => {
        expect(
            supportsSessionContinuityResume({
                driver: 'codex',
                startedBy: 'runner',
            } as never)
        ).toBe(true)
        expect(
            supportsSessionContinuityResume({
                driver: 'codex',
                startedBy: 'terminal',
            } as never)
        ).toBe(false)
        expect(
            supportsSessionContinuityResume({
                driver: 'pi',
                startedBy: 'runner',
            } as never)
        ).toBe(false)
    })

    it('writes driver-scoped handles immutably and can clear one handle without mutating the input', () => {
        const metadata = {
            driver: 'claude',
            runtimeHandles: {
                claude: { sessionId: 'claude-session' },
            },
        } as const

        const withCodexHandle = setSessionDriverRuntimeHandle(metadata, 'codex', { sessionId: 'codex-session' })
        const clearedCodexHandle = setSessionDriverRuntimeHandle(withCodexHandle, 'codex', undefined)

        expect(withCodexHandle).toEqual({
            driver: 'codex',
            runtimeHandles: {
                claude: { sessionId: 'claude-session' },
                codex: { sessionId: 'codex-session' },
            },
        })
        expect(clearedCodexHandle).toEqual({
            driver: 'codex',
            runtimeHandles: {
                claude: { sessionId: 'claude-session' },
            },
        })
        expect(metadata).toEqual({
            driver: 'claude',
            runtimeHandles: {
                claude: { sessionId: 'claude-session' },
            },
        })
    })
})
