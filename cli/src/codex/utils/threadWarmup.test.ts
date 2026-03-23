import { describe, expect, it, vi } from 'vitest'
import type { EnhancedMode } from '@/codex/loop'
import { ensureCodexThreadStarted, getCodexThreadMode } from './threadWarmup'

function createMode(overrides: Partial<EnhancedMode> = {}): EnhancedMode {
    return {
        permissionMode: 'default',
        collaborationMode: 'default',
        ...overrides
    }
}

function createSessionStub(overrides?: {
    sessionId?: string | null
    permissionMode?: 'default' | 'read-only' | 'safe-yolo' | 'yolo' | undefined
    model?: string | null
    modelReasoningEffort?: EnhancedMode['modelReasoningEffort']
    collaborationMode?: EnhancedMode['collaborationMode'] | undefined
}) {
    return {
        path: '/workspace/project',
        sessionId: overrides?.sessionId ?? null,
        codexCliOverrides: undefined,
        getPermissionMode() {
            return overrides?.permissionMode ?? 'default'
        },
        getModel() {
            return overrides?.model ?? null
        },
        getModelReasoningEffort() {
            return overrides?.modelReasoningEffort
        },
        getCollaborationMode() {
            return overrides?.collaborationMode
        }
    }
}

describe('threadWarmup', () => {
    it('prefers session values and falls back to the queued mode when needed', () => {
        const session = createSessionStub({
            permissionMode: 'safe-yolo',
            model: null,
            collaborationMode: undefined
        })

        expect(getCodexThreadMode(session as never, createMode({
            permissionMode: 'read-only',
            model: 'gpt-5.4',
            modelReasoningEffort: 'medium',
            collaborationMode: 'plan'
        }))).toEqual({
            permissionMode: 'safe-yolo',
            model: 'gpt-5.4',
            modelReasoningEffort: 'medium',
            collaborationMode: 'plan'
        })
    })

    it('resumes an existing app-server thread when session id is already known', async () => {
        const resumeThread = vi.fn(async () => ({
            thread: { id: 'thread-resumed' },
            model: 'gpt-5.4'
        }))
        const startThread = vi.fn()
        const onModelResolved = vi.fn()

        const threadId = await ensureCodexThreadStarted({
            session: createSessionStub({ sessionId: 'thread-existing' }) as never,
            appServerClient: {
                resumeThread,
                startThread
            } as never,
            mode: createMode(),
            abortSignal: new AbortController().signal,
            onModelResolved
        })

        expect(threadId).toBe('thread-resumed')
        expect(resumeThread).toHaveBeenCalledWith(expect.objectContaining({
            threadId: 'thread-existing',
            cwd: '/workspace/project'
        }), expect.objectContaining({
            signal: expect.any(AbortSignal)
        }))
        expect(startThread).not.toHaveBeenCalled()
        expect(onModelResolved).toHaveBeenCalledWith('gpt-5.4')
    })

    it('surfaces resume errors instead of silently starting a new thread', async () => {
        const resumeThread = vi.fn(async () => {
            throw new Error('thread missing')
        })
        const startThread = vi.fn()
        const onModelResolved = vi.fn()

        await expect(ensureCodexThreadStarted({
            session: createSessionStub({ sessionId: 'thread-stale' }) as never,
            appServerClient: {
                resumeThread,
                startThread
            } as never,
            mode: createMode({ permissionMode: 'read-only' }),
            abortSignal: new AbortController().signal,
            onModelResolved
        })).rejects.toThrow('thread missing')

        expect(startThread).not.toHaveBeenCalled()
        expect(onModelResolved).not.toHaveBeenCalled()
    })
})
