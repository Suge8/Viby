import { describe, expect, it, vi } from 'vitest'
import {
    attachCopilotSdkSession,
    disconnectCopilotSdkSession,
    isCopilotSessionMissingError,
} from './copilotSessionLifecycle'

describe('copilotSessionLifecycle', () => {
    it('treats wrapped SDK missing-session errors as recoverable', () => {
        expect(
            isCopilotSessionMissingError(
                new Error('Request session.send failed with message: Session not found: sdk-session-1')
            )
        ).toBe(true)
        expect(isCopilotSessionMissingError(new Error('Something else failed'))).toBe(false)
    })

    it('resumes the durable Copilot session id when it already exists', async () => {
        const resumeSession = vi.fn(async () => ({
            sessionId: 'hub-session-1',
        }))
        const createSession = vi.fn()
        const reportSessionId = vi.fn()

        const sdkSession = await attachCopilotSdkSession({
            client: {
                resumeSession,
                createSession,
            } as unknown as Parameters<typeof attachCopilotSdkSession>[0]['client'],
            session: {
                durableSessionId: 'hub-session-1',
                sessionId: 'hub-session-1',
                currentModel: 'gpt-5',
            },
            permissionHandler: vi.fn(),
            reportSessionId,
        })

        expect(sdkSession.sessionId).toBe('hub-session-1')
        expect(resumeSession).toHaveBeenCalledWith(
            'hub-session-1',
            expect.objectContaining({
                model: 'gpt-5',
                streaming: true,
            })
        )
        expect(createSession).not.toHaveBeenCalled()
        expect(reportSessionId).toHaveBeenCalledWith('hub-session-1')
    })

    it('creates the durable Copilot session id on first attach when no persisted session exists yet', async () => {
        const resumeSession = vi.fn(async () => {
            throw new Error('Session not found: hub-session-2')
        })
        const createSession = vi.fn(async () => ({
            sessionId: 'hub-session-2',
        }))
        const reportSessionId = vi.fn()

        const sdkSession = await attachCopilotSdkSession({
            client: {
                resumeSession,
                createSession,
            } as unknown as Parameters<typeof attachCopilotSdkSession>[0]['client'],
            session: {
                durableSessionId: 'hub-session-2',
                sessionId: null,
                currentModel: undefined,
            },
            permissionHandler: vi.fn(),
            reportSessionId,
        })

        expect(sdkSession.sessionId).toBe('hub-session-2')
        expect(createSession).toHaveBeenCalledWith(
            expect.objectContaining({
                sessionId: 'hub-session-2',
                model: 'gpt-5',
                streaming: true,
            })
        )
        expect(reportSessionId).toHaveBeenCalledWith('hub-session-2')
    })

    it('treats a non-canonical persisted handle as stale and recreates the durable session', async () => {
        const resumeSession = vi.fn(async () => {
            throw new Error('Session not found: hub-session-2')
        })
        const createSession = vi.fn(async () => ({
            sessionId: 'hub-session-2',
        }))
        const reportSessionId = vi.fn()

        const sdkSession = await attachCopilotSdkSession({
            client: {
                resumeSession,
                createSession,
            } as unknown as Parameters<typeof attachCopilotSdkSession>[0]['client'],
            session: {
                durableSessionId: 'hub-session-2',
                sessionId: 'stale-provider-handle',
                currentModel: undefined,
            },
            permissionHandler: vi.fn(),
            reportSessionId,
        })

        expect(sdkSession.sessionId).toBe('hub-session-2')
        expect(createSession).toHaveBeenCalledWith(
            expect.objectContaining({
                sessionId: 'hub-session-2',
                model: 'gpt-5',
                streaming: true,
            })
        )
        expect(reportSessionId).toHaveBeenCalledWith('hub-session-2')
    })

    it('does not silently create a fresh session when a persisted durable session goes missing', async () => {
        const resumeSession = vi.fn(async () => {
            throw new Error('Session not found: hub-session-3')
        })
        const createSession = vi.fn()

        await expect(
            attachCopilotSdkSession({
                client: {
                    resumeSession,
                    createSession,
                } as unknown as Parameters<typeof attachCopilotSdkSession>[0]['client'],
                session: {
                    durableSessionId: 'hub-session-3',
                    sessionId: 'hub-session-3',
                    currentModel: 'gpt-5',
                },
                permissionHandler: vi.fn(),
                reportSessionId: vi.fn(),
            })
        ).rejects.toThrow('Session not found: hub-session-3')

        expect(createSession).not.toHaveBeenCalled()
    })

    it('disconnects the active sdk session when asked', async () => {
        const disconnect = vi.fn(async () => undefined)

        await disconnectCopilotSdkSession({
            disconnect,
        } as unknown as Awaited<ReturnType<Parameters<typeof attachCopilotSdkSession>[0]['client']['createSession']>>)

        expect(disconnect).toHaveBeenCalledTimes(1)
    })
})
