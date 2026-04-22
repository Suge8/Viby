import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emitDraftTrace } from '@/components/AssistantChat/composerDraftTrace'

declare global {
    interface Window {
        __VIBY_DRAFT_TRACE__?: Array<unknown>
        __VIBY_ENABLE_DRAFT_TRACE_LOG__?: boolean
    }
}

describe('emitDraftTrace', () => {
    beforeEach(() => {
        window.__VIBY_DRAFT_TRACE__ = []
        window.__VIBY_ENABLE_DRAFT_TRACE_LOG__ = false
    })

    it('records draft events without spamming the console by default', () => {
        const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})

        emitDraftTrace({
            type: 'write',
            sessionId: 'session-1',
            valueLength: 4,
            reason: 'composer-change',
        })

        expect(window.__VIBY_DRAFT_TRACE__).toHaveLength(1)
        expect(debugSpy).not.toHaveBeenCalled()

        debugSpy.mockRestore()
    })

    it('allows explicit opt-in logging for local draft diagnostics', () => {
        const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
        window.__VIBY_ENABLE_DRAFT_TRACE_LOG__ = true

        emitDraftTrace({
            type: 'write',
            sessionId: 'session-1',
            valueLength: 4,
            reason: 'composer-change',
        })

        expect(debugSpy).toHaveBeenCalledWith(
            '[WebRuntime] draft trace',
            expect.objectContaining({
                sessionId: 'session-1',
            })
        )

        debugSpy.mockRestore()
    })
})
