import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => ({
    spawnMock: vi.fn(),
    killProcessByChildProcess: vi.fn(async () => undefined),
    withBunRuntimeEnv: vi.fn((env: NodeJS.ProcessEnv) => env),
    appendMcpConfigArg: vi.fn(() => null),
}))

vi.mock('node:child_process', () => ({
    spawn: harness.spawnMock,
}))

vi.mock('@/utils/process', () => ({
    killProcessByChildProcess: harness.killProcessByChildProcess,
}))

vi.mock('@/utils/bunRuntime', () => ({
    withBunRuntimeEnv: harness.withBunRuntimeEnv,
}))

vi.mock('../utils/mcpConfig', () => ({
    appendMcpConfigArg: harness.appendMcpConfigArg,
}))

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: vi.fn(),
    },
}))

import { query } from './query'

class FakeChildProcess extends EventEmitter {
    stdin = new PassThrough()
    stdout = new PassThrough()
    stderr = new PassThrough()
    killed = false
}

function createChild() {
    return new FakeChildProcess()
}

async function consumeAllMessages(iterable: AsyncIterable<unknown>): Promise<void> {
    for await (const _ of iterable) {
        // Intentionally empty
    }
}

describe('claude sdk query', () => {
    beforeEach(() => {
        harness.spawnMock.mockReset()
        harness.killProcessByChildProcess.mockClear()
        harness.withBunRuntimeEnv.mockClear()
        harness.appendMcpConfigArg.mockClear()
    })

    it('rejects instead of hanging when the Claude process closes with a non-zero exit code', async () => {
        const child = createChild()
        harness.spawnMock.mockReturnValue(child)

        const response = query({
            prompt: 'hello',
            options: { pathToClaudeCodeExecutable: 'claude' },
        })
        const consumer = consumeAllMessages(response)

        child.stdout.end()
        child.emit('close', 1)

        await expect(consumer).rejects.toThrow('Claude Code process exited with code 1')
    })

    it('surfaces prompt streaming failures to the iterator immediately', async () => {
        const child = createChild()
        harness.spawnMock.mockReturnValue(child)
        const promptError = new Error('prompt failed')

        const response = query({
            prompt: {
                async *[Symbol.asyncIterator]() {
                    throw promptError
                },
            },
            options: {
                pathToClaudeCodeExecutable: 'claude',
                promptFailureCleanupTimeoutMs: 1,
            },
        })

        await expect(consumeAllMessages(response)).rejects.toThrow('prompt failed')
        expect(harness.killProcessByChildProcess).toHaveBeenCalled()
    })

    it('enables Claude partial messages only when explicitly requested', () => {
        const child = createChild()
        harness.spawnMock.mockReturnValue(child)

        query({
            prompt: 'hello',
            options: {
                pathToClaudeCodeExecutable: 'claude',
                includePartialMessages: true,
            },
        })

        expect(harness.spawnMock).toHaveBeenCalledWith(
            'claude',
            expect.arrayContaining(['--include-partial-messages']),
            expect.any(Object)
        )
    })
})
