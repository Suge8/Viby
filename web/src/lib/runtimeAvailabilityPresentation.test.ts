import { describe, expect, it } from 'vitest'
import { getRuntimeAvailabilityCopy, getRuntimeAvailabilityPresentation } from '@/lib/runtimeAvailabilityPresentation'
import type { LocalRuntime } from '@/types/api'

function createTranslationStub(): (key: string, values?: Record<string, string | number>) => string {
    return (key: string, values?: Record<string, string | number>) => {
        if (key === 'runtime.unavailable.lastError') {
            return `runtime.unavailable.lastError:${String(values?.error ?? '')}`
        }

        return key
    }
}

function createRuntime(overrides?: Partial<LocalRuntime>): LocalRuntime {
    return {
        id: 'runtime-1',
        active: false,
        metadata: null,
        runnerState: null,
        ...overrides,
    }
}

describe('runtimeAvailabilityPresentation', () => {
    it('returns loading while the runtime query is still loading', () => {
        expect(
            getRuntimeAvailabilityPresentation({
                runtime: null,
                isLoading: true,
                error: null,
                t: createTranslationStub(),
            })
        ).toEqual({ kind: 'loading' })
    })

    it('returns ready when the local runtime is active', () => {
        expect(
            getRuntimeAvailabilityPresentation({
                runtime: createRuntime({ active: true }),
                isLoading: false,
                error: null,
                t: createTranslationStub(),
            })
        ).toEqual({ kind: 'ready' })
    })

    it('surfaces the runtime query error directly', () => {
        const availability = getRuntimeAvailabilityPresentation({
            runtime: null,
            isLoading: false,
            error: 'runtime query failed',
            t: createTranslationStub(),
        })

        expect(availability).toEqual({
            kind: 'load-error',
            detail: 'runtime query failed',
        })
        expect(
            getRuntimeAvailabilityCopy(availability, {
                loadRuntimeErrorTitle: 'newSession.error.loadRuntimeTitle',
                t: createTranslationStub(),
            })
        ).toEqual({
            noticeTitle: 'newSession.error.loadRuntimeTitle',
            noticeDescription: 'runtime query failed',
            blockedTitle: 'newSession.error.loadRuntimeTitle',
            blockedDescription: 'runtime.unavailable.loadMessage',
            blockedDetail: 'runtime query failed',
        })
    })

    it('uses the shared startup failure description when the inactive runtime has a spawn error', () => {
        expect(
            getRuntimeAvailabilityPresentation({
                runtime: createRuntime({
                    runnerState: {
                        lastSpawnError: {
                            message: 'spawn failed',
                            at: Date.UTC(2026, 3, 9, 18, 0, 0),
                        },
                    },
                }),
                isLoading: false,
                error: null,
                t: createTranslationStub(),
            })
        ).toMatchObject({
            kind: 'unavailable',
            detail: expect.stringContaining('runtime.unavailable.lastError:spawn failed'),
            noticeDescription: expect.stringContaining('runtime.unavailable.lastError:spawn failed'),
        })
    })

    it('keeps the unavailable detail empty when there is no startup failure detail', () => {
        const availability = getRuntimeAvailabilityPresentation({
            runtime: createRuntime(),
            isLoading: false,
            error: null,
            t: createTranslationStub(),
        })

        expect(availability).toEqual({
            kind: 'unavailable',
            detail: null,
            noticeDescription: 'runtime.unavailable.message',
        })
        expect(
            getRuntimeAvailabilityCopy(availability, {
                loadRuntimeErrorTitle: 'newSession.error.loadRuntimeTitle',
                t: createTranslationStub(),
            })
        ).toEqual({
            noticeTitle: 'runtime.unavailable.title',
            noticeDescription: 'runtime.unavailable.message',
            blockedTitle: 'runtime.unavailable.title',
            blockedDescription: 'runtime.unavailable.message',
            blockedDetail: 'runtime.unavailable.hint',
        })
    })

    it('keeps an inactive runtime snapshot authoritative even if a refetch failed afterward', () => {
        expect(
            getRuntimeAvailabilityPresentation({
                runtime: createRuntime(),
                isLoading: false,
                error: 'runtime query failed',
                t: createTranslationStub(),
            })
        ).toEqual({
            kind: 'unavailable',
            detail: null,
            noticeDescription: 'runtime.unavailable.message',
        })
    })
})
