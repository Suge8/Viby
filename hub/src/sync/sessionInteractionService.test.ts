import { describe, expect, it, vi } from 'bun:test'
import type { Session } from '@viby/protocol/types'
import { SessionInteractionService } from './sessionInteractionService'

function createSession(driver: 'gemini' | 'codex'): Session {
    return {
        id: 'session-1',
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: true,
        activeAt: 1,
        metadata: {
            path: '/tmp/project',
            host: 'localhost',
            machineId: 'machine-1',
            driver,
        },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 0,
        thinking: false,
        thinkingAt: 1,
        model: null,
        modelReasoningEffort: null,
    }
}

describe('SessionInteractionService', () => {
    it('emits command capability invalidation after provider reload commands succeed', async () => {
        const session = createSession('gemini')
        const onCommandCapabilitiesInvalidated = vi.fn()
        const appendUserMessage = vi.fn(async () => undefined)
        const service = new SessionInteractionService({
            getSession: () => session,
            hasMessages: () => true,
            startSession: async () => ({ type: 'success', sessionId: session.id }),
            resumeSession: async () => ({ type: 'success', sessionId: session.id }),
            unarchiveSession: async () => session,
            appendUserMessage,
            refreshSession: () => session,
            uploadFile: async () => ({ success: true }),
            deleteUploadFile: async () => ({ success: true }),
            onCommandCapabilitiesInvalidated,
            createSendError: (message) => new Error(message),
        })

        await service.sendMessage(session.id, {
            text: '/commands reload',
            sentFrom: 'webapp',
        })

        expect(appendUserMessage).toHaveBeenCalledTimes(1)
        expect(onCommandCapabilitiesInvalidated).toHaveBeenCalledWith(session.id)
    })

    it('does not emit capability invalidation for ordinary slash commands', async () => {
        const session = createSession('codex')
        const onCommandCapabilitiesInvalidated = vi.fn()
        const service = new SessionInteractionService({
            getSession: () => session,
            hasMessages: () => true,
            startSession: async () => ({ type: 'success', sessionId: session.id }),
            resumeSession: async () => ({ type: 'success', sessionId: session.id }),
            unarchiveSession: async () => session,
            appendUserMessage: async () => undefined,
            refreshSession: () => session,
            uploadFile: async () => ({ success: true }),
            deleteUploadFile: async () => ({ success: true }),
            onCommandCapabilitiesInvalidated,
            createSendError: (message) => new Error(message),
        })

        await service.sendMessage(session.id, {
            text: '/status',
            sentFrom: 'webapp',
        })

        expect(onCommandCapabilitiesInvalidated).not.toHaveBeenCalled()
    })

    it('blocks hand-typed resume commands behind the lifecycle owner', async () => {
        const session = createSession('codex')
        const service = new SessionInteractionService({
            getSession: () => session,
            hasMessages: () => true,
            startSession: async () => ({ type: 'success', sessionId: session.id }),
            resumeSession: async () => ({ type: 'success', sessionId: session.id }),
            unarchiveSession: async () => session,
            appendUserMessage: async () => undefined,
            refreshSession: () => session,
            uploadFile: async () => ({ success: true }),
            deleteUploadFile: async () => ({ success: true }),
            onCommandCapabilitiesInvalidated: () => {},
            createSendError: (message) => new Error(message),
        })

        await expect(
            service.sendMessage(session.id, {
                text: '/resume latest',
                sentFrom: 'webapp',
            })
        ).rejects.toThrow(
            'This command is managed by Viby. Open History for Hub-managed chats, or use New Session → Recover Local for local sessions Viby has not imported yet.'
        )
    })

    it('keeps inactive sessions inactive while attachment uploads use the machine-scoped owner', async () => {
        const session = {
            ...createSession('codex'),
            active: false,
        }
        const startSession = vi.fn(async () => ({ type: 'success' as const, sessionId: session.id }))
        const resumeSession = vi.fn(async () => ({ type: 'success' as const, sessionId: session.id }))
        const uploadFile = vi.fn(async () => ({ success: true, path: '/tmp/uploaded.png' }))
        const service = new SessionInteractionService({
            getSession: () => session,
            hasMessages: () => true,
            startSession,
            resumeSession,
            unarchiveSession: async () => session,
            appendUserMessage: async () => undefined,
            refreshSession: () => session,
            uploadFile,
            deleteUploadFile: async () => ({ success: true }),
            onCommandCapabilitiesInvalidated: () => {},
            createSendError: (message) => new Error(message),
        })

        const result = await service.uploadFile(session.id, 'photo.png', 'YWJj', 'image/png')

        expect(result).toEqual({ success: true, path: '/tmp/uploaded.png' })
        expect(uploadFile).toHaveBeenCalledWith('machine-1', session.id, 'photo.png', 'YWJj', 'image/png')
        expect(startSession).not.toHaveBeenCalled()
        expect(resumeSession).not.toHaveBeenCalled()
        expect(session.active).toBe(false)
    })
})
