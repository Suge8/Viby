import { describe, expect, it } from 'bun:test'
import { resolveSessionResumeState, resolveSessionResumeStrategy } from './sessionResume'

describe('sessionResume', () => {
    it('prefers provider handles when a runtime session id exists', () => {
        expect(
            resolveSessionResumeStrategy({
                driver: 'codex',
                runtimeHandles: {
                    codex: { sessionId: 'session-1' },
                },
                startedBy: 'runner',
            })
        ).toBe('provider-handle')
    })

    it('falls back to transcript replay for handleless drivers', () => {
        expect(
            resolveSessionResumeStrategy({
                driver: 'pi',
                startedBy: 'runner',
            })
        ).toBe('transcript-replay')
    })

    it('uses continuity handoff only for runner-managed supported drivers', () => {
        expect(
            resolveSessionResumeStrategy({
                driver: 'claude',
                startedBy: 'runner',
            })
        ).toBe('continuity-handoff')

        expect(
            resolveSessionResumeStrategy({
                driver: 'claude',
                startedBy: 'terminal',
            })
        ).toBe('none')
    })

    it('returns none when metadata is absent or unsupported', () => {
        expect(resolveSessionResumeStrategy(null)).toBe('none')
        expect(resolveSessionResumeStrategy({ driver: undefined, startedBy: 'runner' })).toBe('none')
    })

    it('keeps authoritative resume hints aligned with the derived strategy owner', () => {
        expect(
            resolveSessionResumeState({
                metadata: {
                    driver: 'claude',
                    startedBy: 'terminal',
                },
                resumeAvailableHint: true,
            })
        ).toEqual({
            resumeAvailable: true,
            resumeStrategy: 'none',
        })
    })
})
