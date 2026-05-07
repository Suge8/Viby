import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useNewSessionCreateAction } from './useNewSessionCreateAction'

function createOptions(overrides: Partial<Parameters<typeof useNewSessionCreateAction>[0]> = {}) {
    return {
        trimmedDirectory: '/repo',
        sessionType: 'simple' as const,
        worktreeName: '',
        yoloMode: false,
        directoryCreationConfirmed: true,
        effectiveAgent: 'codex' as const,
        effectiveModel: 'auto',
        effectiveReasoningEffort: 'default' as const,
        effectiveCodexServiceTier: 'standard' as const,
        checkPathsExists: vi.fn(async () => ({ '/repo': true })),
        confirmDirectoryCreation: vi.fn(),
        spawnSession: vi.fn(async () => ({ type: 'success' as const, session: { id: 'session-1' } })),
        buildPreferenceSnapshotFor: vi.fn(() => ({
            agent: 'codex' as const,
            sessionType: 'simple' as const,
            yoloMode: false,
            agentSettings: {},
        })),
        addRecentPath: vi.fn(),
        onSuccess: vi.fn(),
        notifySuccess: vi.fn(),
        notifyError: vi.fn(),
        setError: vi.fn(),
        t: (key: string) => key,
        formatError: (error: unknown) => String(error),
        ...overrides,
    } satisfies Parameters<typeof useNewSessionCreateAction>[0]
}

describe('useNewSessionCreateAction', () => {
    it('keeps session creation single-flight across rapid repeated taps', async () => {
        let resolveSpawn: ((value: { type: 'success'; session: { id: string } }) => void) | null = null
        const spawnSession = vi.fn(
            () =>
                new Promise<{ type: 'success'; session: { id: string } }>((resolve) => {
                    resolveSpawn = resolve
                })
        )
        const options = createOptions({ spawnSession })
        const { result } = renderHook(() => useNewSessionCreateAction(options))

        await act(async () => {
            const first = result.current.handleCreate()
            const second = result.current.handleCreate()
            await Promise.resolve()

            expect(spawnSession).toHaveBeenCalledTimes(1)
            resolveSpawn?.({ type: 'success', session: { id: 'session-1' } })
            await Promise.all([first, second])
        })

        expect(options.onSuccess).toHaveBeenCalledTimes(1)
        expect(options.onSuccess).toHaveBeenCalledWith('session-1')
    })

    it('keeps the action pending while the created session is opening', async () => {
        let releaseOpen: (() => void) | null = null
        const onSuccess = vi.fn(
            () =>
                new Promise<void>((resolve) => {
                    releaseOpen = resolve
                })
        )
        const options = createOptions({ onSuccess })
        const { result } = renderHook(() => useNewSessionCreateAction(options))

        await act(async () => {
            void result.current.handleCreate()
        })

        await waitFor(() => {
            expect(result.current.createPhase).toBe('opening')
        })

        await act(async () => {
            releaseOpen?.()
            await Promise.resolve()
        })

        expect(result.current.createPhase).toBe('opening')
    })
})
