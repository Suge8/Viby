import { describe, expect, it, vi } from 'vitest'
import { createRunnerLifecycle } from '@/agent/runnerLifecycle'

describe('createRunnerLifecycle', () => {
    it('does not overwrite lifecycle metadata during cleanup', async () => {
        const session = {
            updateMetadata: vi.fn(),
            sendSessionDeath: vi.fn(),
            flush: vi.fn(async () => {}),
            close: vi.fn(async () => {})
        }

        const lifecycle = createRunnerLifecycle({
            session: session as never,
            logTag: 'runner-lifecycle-test'
        })

        await lifecycle.cleanup()

        expect(session.updateMetadata).not.toHaveBeenCalled()
        expect(session.sendSessionDeath).toHaveBeenCalledTimes(1)
        expect(session.flush).toHaveBeenCalledTimes(1)
        expect(session.close).toHaveBeenCalledTimes(1)
    })
})
