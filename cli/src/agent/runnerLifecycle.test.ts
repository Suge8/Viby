import { describe, expect, it, vi } from 'vitest'
import { createRunnerLifecycle, createRuntimeStopRequestHandler } from '@/agent/runnerLifecycle'

describe('createRunnerLifecycle', () => {
    it('does not overwrite lifecycle metadata during cleanup', async () => {
        const session = {
            updateMetadata: vi.fn(),
            sendSessionDeath: vi.fn(),
            flush: vi.fn(async () => {}),
            close: vi.fn(async () => {}),
        }

        const lifecycle = createRunnerLifecycle({
            session: session as never,
            logTag: 'runner-lifecycle-test',
        })

        await lifecycle.cleanup()

        expect(session.updateMetadata).not.toHaveBeenCalled()
        expect(session.sendSessionDeath).toHaveBeenCalledTimes(1)
        expect(session.flush).toHaveBeenCalledTimes(1)
        expect(session.close).toHaveBeenCalledTimes(1)
    })

    it('routes SIGINT through the graceful shutdown owner when provided', async () => {
        const session = {
            sendSessionDeath: vi.fn(),
            flush: vi.fn(async () => {}),
            close: vi.fn(async () => {}),
        }
        const requestShutdown = vi.fn(async () => {})
        const handlers = new Map<string, () => void>()
        const processOnSpy = vi.spyOn(process, 'on').mockImplementation(((event: string, handler: () => void) => {
            handlers.set(event, handler)
            return process
        }) as never)

        const lifecycle = createRunnerLifecycle({
            session: session as never,
            logTag: 'runner-lifecycle-test',
            requestShutdown,
        })

        lifecycle.registerProcessHandlers()
        handlers.get('SIGINT')?.()
        await Promise.resolve()

        expect(requestShutdown).toHaveBeenCalledTimes(1)
        expect(session.sendSessionDeath).not.toHaveBeenCalled()

        processOnSpy.mockRestore()
    })

    it('requests runtime stop before falling back to cleanup', async () => {
        const cleanupAndExit = vi.fn(async () => {})
        const requestRuntimeStop = vi.fn(async () => true)
        const requestShutdown = createRuntimeStopRequestHandler({
            getOwner: () => ({ requestRuntimeStop }),
            cleanupAndExit,
        })

        await requestShutdown()

        expect(requestRuntimeStop).toHaveBeenCalledTimes(1)
        expect(cleanupAndExit).not.toHaveBeenCalled()
    })

    it('falls back to lifecycle cleanup when no runtime stop owner is active', async () => {
        const cleanupAndExit = vi.fn(async () => {})
        const requestShutdown = createRuntimeStopRequestHandler({
            getOwner: () => null,
            cleanupAndExit,
        })

        await requestShutdown()

        expect(cleanupAndExit).toHaveBeenCalledTimes(1)
    })

    it('falls back to lifecycle cleanup when the runtime stop owner throws', async () => {
        const cleanupAndExit = vi.fn(async () => {})
        const requestRuntimeStop = vi.fn(async () => {
            throw new Error('stop failed')
        })
        const requestShutdown = createRuntimeStopRequestHandler({
            getOwner: () => ({ requestRuntimeStop }),
            cleanupAndExit,
        })

        await requestShutdown()

        expect(requestRuntimeStop).toHaveBeenCalledTimes(1)
        expect(cleanupAndExit).toHaveBeenCalledTimes(1)
    })
})
