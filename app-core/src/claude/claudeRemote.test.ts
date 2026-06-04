import { describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => {
    const queryMock = vi.fn()

    class AbortError extends Error {
        constructor(message: string) {
            super(message)
            this.name = 'AbortError'
        }
    }

    return {
        queryMock,
        AbortError,
    }
})

vi.mock('@/claude/sdk', () => ({
    query: harness.queryMock,
    AbortError: harness.AbortError,
    SDKUserMessage: class {},
}))

vi.mock('@/parsers/specialCommands', () => ({
    parseSpecialCommand: () => ({ type: 'none' }),
}))

vi.mock('@/lib', () => ({
    logger: {
        debug: vi.fn(),
        debugLargeJson: vi.fn(),
    },
}))

vi.mock('@/modules/watcher/awaitFileExist', () => ({
    awaitFileExist: vi.fn(async () => true),
}))

vi.mock('./utils/path', () => ({
    getProjectPath: () => '/tmp',
}))

vi.mock('./utils/claudeCheckSession', () => ({
    claudeCheckSession: vi.fn(() => true),
}))

vi.mock('./utils/systemPrompt', () => ({
    systemPrompt: 'system-prompt',
}))

vi.mock('@/constants/uploadPaths', () => ({
    getVibyBlobsDir: () => '/tmp/viby-blobs',
}))

vi.mock('./sdk/utils', () => ({
    getDefaultClaudeCodePath: () => 'claude',
}))

import { claudeRemote } from './claudeRemote'

describe('claudeRemote', () => {
    it('reports a known Claude resume handle before waiting for the first queued user turn', async () => {
        let resolveNextMessage: ((value: { message: string; mode: any } | null) => void) | undefined
        const onDiscoveredSessionId = vi.fn()
        const nextMessage = vi.fn(
            () =>
                new Promise<{ message: string; mode: any } | null>((resolve) => {
                    resolveNextMessage = resolve
                })
        )

        const run = claudeRemote({
            sessionId: 'claude-session-1',
            path: '/tmp/project',
            allowedTools: [],
            hookSettingsPath: '/tmp/hook-settings.json',
            canCallTool: vi.fn(),
            nextMessage,
            onReady: vi.fn(),
            isAborted: () => false,
            onDiscoveredSessionId,
            onMessage: vi.fn(),
            onCompletionEvent: vi.fn(),
            onSessionReset: vi.fn(),
        })

        expect(onDiscoveredSessionId).toHaveBeenCalledWith('claude-session-1')
        expect(harness.queryMock).not.toHaveBeenCalled()

        resolveNextMessage?.(null)
        await run
    })

    it('keeps consuming async Claude notifications after a result while next user input is still pending', async () => {
        let resolveNextMessage: ((value: { message: string; mode: any } | null) => void) | undefined
        const onMessage = vi.fn()
        const onReady = vi.fn()
        const nextMessage = vi
            .fn()
            .mockResolvedValueOnce({
                message: 'hello',
                mode: { permissionMode: 'default' },
            })
            .mockImplementationOnce(
                () =>
                    new Promise((resolve) => {
                        resolveNextMessage = resolve
                    })
            )

        harness.queryMock.mockReturnValue(
            (async function* () {
                yield { type: 'result' }
                yield {
                    type: 'assistant',
                    message: {
                        role: 'assistant',
                        content: 'background notification',
                    },
                }
            })()
        )

        const run = claudeRemote({
            sessionId: null,
            path: '/tmp/project',
            allowedTools: [],
            hookSettingsPath: '/tmp/hook-settings.json',
            canCallTool: vi.fn(),
            nextMessage,
            onReady,
            isAborted: () => false,
            onDiscoveredSessionId: vi.fn(),
            onMessage,
            onCompletionEvent: vi.fn(),
            onSessionReset: vi.fn(),
        })

        await new Promise((resolve) => setTimeout(resolve, 0))
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(onReady).toHaveBeenCalledTimes(1)
        expect(onMessage).toHaveBeenCalledTimes(2)
        expect(onMessage.mock.calls[1]?.[0]).toMatchObject({
            type: 'assistant',
        })

        resolveNextMessage?.(null)
        await run
    })

    it('requests Claude partial assistant messages for remote text streaming', async () => {
        harness.queryMock.mockReturnValue(
            (async function* () {
                yield { type: 'result' }
            })()
        )

        await claudeRemote({
            sessionId: null,
            path: '/tmp/project',
            allowedTools: [],
            hookSettingsPath: '/tmp/hook-settings.json',
            canCallTool: vi.fn(),
            nextMessage: vi.fn().mockResolvedValueOnce({
                message: 'hello',
                mode: { permissionMode: 'default' },
            }),
            onReady: vi.fn(),
            isAborted: () => false,
            onDiscoveredSessionId: vi.fn(),
            onMessage: vi.fn(),
            onCompletionEvent: vi.fn(),
            onSessionReset: vi.fn(),
        })

        expect(harness.queryMock).toHaveBeenCalledWith(
            expect.objectContaining({
                options: expect.objectContaining({
                    includePartialMessages: true,
                }),
            })
        )
    })
})
