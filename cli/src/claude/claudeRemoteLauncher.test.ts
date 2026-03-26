import { describe, expect, it, vi } from 'vitest'

vi.mock('react', () => ({
    default: {
        createElement: vi.fn(() => null)
    }
}))

vi.mock('./claudeRemote', () => ({
    claudeRemote: vi.fn()
}))

vi.mock('./utils/permissionHandler', () => ({
    PermissionHandler: class {}
}))

vi.mock('./sdk', () => ({
    SDKAssistantMessage: class {},
    SDKMessage: class {},
    SDKUserMessage: class {}
}))

vi.mock('@/ui/messageFormatterInk', () => ({
    formatClaudeMessageForInk: vi.fn()
}))

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: vi.fn()
    }
}))

vi.mock('./utils/sdkToLogConverter', () => ({
    SDKToLogConverter: class {}
}))

vi.mock('./sdk/prompts', () => ({
    PLAN_FAKE_REJECT: 'PLAN_FAKE_REJECT'
}))

vi.mock('./utils/OutgoingMessageQueue', () => ({
    OutgoingMessageQueue: class {}
}))

vi.mock('@/modules/common/remote/RemoteLauncherBase', () => ({
    RemoteLauncherBase: class {
        protected readonly messageBuffer = {
            addMessage() {},
            clear() {}
        }
        protected readonly hasTTY = false
        protected readonly logPath?: string
        protected exitReason: 'switch' | 'exit' | null = null
        protected shouldExit = false

        constructor(logPath?: string) {
            this.logPath = logPath
        }
    }
}))

import { ClaudeRemoteLauncher } from './claudeRemoteLauncher'

describe('ClaudeRemoteLauncher abort', () => {
    it('drops thinking immediately and clears the queued prompt when abort is requested', async () => {
        const queueReset = vi.fn()
        const onThinkingChange = vi.fn()

        const session = {
            logPath: '/tmp/viby-claude.log',
            queue: {
                reset: queueReset
            },
            onThinkingChange,
            client: {},
            addSessionFoundCallback() {},
            removeSessionFoundCallback() {}
        }

        const launcher = new ClaudeRemoteLauncher(session as never)
        ;(launcher as any).abortController = new AbortController()
        ;(launcher as any).abortFuture = {
            promise: Promise.resolve()
        }

        await (launcher as any).handleAbortRequest()

        expect(queueReset).toHaveBeenCalledTimes(1)
        expect(onThinkingChange).toHaveBeenCalledWith(false)
        expect((launcher as any).abortController.signal.aborted).toBe(true)
    })
})
