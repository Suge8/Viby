import { describe, expect, it } from 'bun:test'
import {
    getSessionDriverResumeToken,
    getSessionDriverRuntimeHandle,
    getSessionDriverRuntimeHandles,
    resolveSessionDriver,
    setSessionDriverRuntimeHandle
} from './sessionDriver'

describe('sessionDriver', () => {
    it('uses metadata.driver as the authoritative driver and reads the matching runtime handle', () => {
        const metadata = {
            driver: 'codex',
            runtimeHandles: {
                claude: { sessionId: 'claude-session' },
                codex: { sessionId: 'codex-session' }
            }
        } as never

        expect(resolveSessionDriver(metadata)).toBe('codex')
        expect(getSessionDriverRuntimeHandle(metadata)).toEqual({ sessionId: 'codex-session' })
        expect(getSessionDriverResumeToken(metadata)).toBe('codex-session')
    })

    it('still reads legacy top-level session ids when runtime handles are absent', () => {
        const metadata = {
            driver: 'gemini',
            geminiSessionId: 'legacy-gemini-session'
        } as never

        expect(resolveSessionDriver(metadata)).toBe('gemini')
        expect(getSessionDriverRuntimeHandle(metadata)).toEqual({ sessionId: 'legacy-gemini-session' })
        expect(getSessionDriverResumeToken(metadata)).toBe('legacy-gemini-session')
    })

    it('treats malformed runtime handle maps as absent instead of guessing', () => {
        const metadata = {
            driver: 'codex',
            runtimeHandles: {
                codex: { sessionId: 42 },
                claude: 'bad-shape'
            }
        } as never

        expect(getSessionDriverRuntimeHandles(metadata)).toBeUndefined()
        expect(getSessionDriverRuntimeHandle(metadata)).toBeUndefined()
        expect(getSessionDriverResumeToken(metadata)).toBeUndefined()
    })

    it('returns null for unknown or missing drivers', () => {
        expect(resolveSessionDriver(null)).toBeNull()
        expect(resolveSessionDriver({ driver: 'unknown' } as never)).toBeNull()
    })

    it('writes driver-scoped handles immutably and can clear one handle without mutating the input', () => {
        const metadata = {
            driver: 'claude',
            runtimeHandles: {
                claude: { sessionId: 'claude-session' }
            }
        }

        const withCodexHandle = setSessionDriverRuntimeHandle(metadata, 'codex', { sessionId: 'codex-session' })
        const clearedCodexHandle = setSessionDriverRuntimeHandle(withCodexHandle, 'codex', undefined)

        expect(withCodexHandle).toEqual({
            driver: 'codex',
            runtimeHandles: {
                claude: { sessionId: 'claude-session' },
                codex: { sessionId: 'codex-session' }
            }
        })
        expect(clearedCodexHandle).toEqual({
            driver: 'codex',
            runtimeHandles: {
                claude: { sessionId: 'claude-session' }
            }
        })
        expect(metadata).toEqual({
            driver: 'claude',
            runtimeHandles: {
                claude: { sessionId: 'claude-session' }
            }
        })
    })
})
