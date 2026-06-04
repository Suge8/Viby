import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOpencodeStorageScanner } from './opencodeStorageScanner'
import { resolveWatchDirectories } from './opencodeStorageWatcher'

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: vi.fn(),
        warn: vi.fn(),
    },
}))

type OpencodeEvent = Parameters<Parameters<typeof createOpencodeStorageScanner>[0]['onEvent']>[0]

async function withTempDir<T>(action: (dir: string) => Promise<T>): Promise<T> {
    const dir = await mkdtemp(join(tmpdir(), 'viby-opencode-storage.'))
    try {
        return await action(dir)
    } finally {
        rmSync(dir, { recursive: true, force: true })
    }
}

async function waitUntil(predicate: () => boolean, label: string): Promise<void> {
    const deadline = Date.now() + 1_000
    while (Date.now() < deadline) {
        if (predicate()) return
        await new Promise((resolve) => setTimeout(resolve, 10))
    }
    throw new Error(`Timed out waiting for ${label}`)
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('opencodeStorageScanner', () => {
    it('reacts to OpenCode file storage changes without a scan interval', async () => {
        await withTempDir(async (dir) => {
            const storageDir = join(dir, 'storage')
            const cwd = join(dir, 'project')
            const startedAt = Date.now()
            const events: OpencodeEvent[] = []
            const discoveredSessionIds: string[] = []
            mkdirSync(join(storageDir, 'session', 'bucket'), { recursive: true })
            mkdirSync(join(storageDir, 'message', 'session-1'), { recursive: true })
            mkdirSync(join(storageDir, 'part', 'message-1'), { recursive: true })
            mkdirSync(cwd, { recursive: true })
            const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')

            const scanner = await createOpencodeStorageScanner({
                sessionId: null,
                cwd,
                storageDir,
                startupTimestampMs: startedAt,
                sessionStartWindowMs: 5_000,
                onEvent: (event) => events.push(event),
                onDiscoveredSessionId: (sessionId) => discoveredSessionIds.push(sessionId),
            })
            expect(setIntervalSpy).not.toHaveBeenCalled()
            setIntervalSpy.mockRestore()

            try {
                writeFileSync(
                    join(storageDir, 'session', 'bucket', 'session-1.json'),
                    JSON.stringify({ id: 'session-1', directory: cwd, time: { created: startedAt + 1 } })
                )
                await waitUntil(() => discoveredSessionIds.includes('session-1'), 'session discovery')

                writeFileSync(
                    join(storageDir, 'message', 'session-1', 'message-1.json'),
                    JSON.stringify({ id: 'message-1', role: 'user', sessionID: 'session-1' })
                )
                await waitUntil(() => events.some((event) => event.event === 'message.updated'), 'message event')

                writeFileSync(
                    join(storageDir, 'part', 'message-1', 'part-1.json'),
                    JSON.stringify({ id: 'part-1', type: 'text', text: 'hello', sessionID: 'session-1' })
                )
                await waitUntil(() => events.some((event) => event.event === 'message.part.updated'), 'part event')
            } finally {
                await scanner.cleanup()
            }
        })
    })

    it('fails an unmatched session on a one-shot deadline, not a scan interval', async () => {
        await withTempDir(async (dir) => {
            const storageDir = join(dir, 'storage')
            const failures: string[] = []
            mkdirSync(storageDir, { recursive: true })

            const scanner = await createOpencodeStorageScanner({
                sessionId: null,
                cwd: join(dir, 'project'),
                storageDir,
                startupTimestampMs: Date.now(),
                sessionStartWindowMs: 20,
                onEvent: () => {},
                onSessionMatchFailed: (message) => failures.push(message),
            })
            try {
                await waitUntil(() => failures.length === 1, 'match deadline')
                expect(failures[0]).toContain('No OpenCode session found within 20ms')
            } finally {
                await scanner.cleanup()
            }
        })
    })

    it('keeps the watcher scope on existing event sources only', async () => {
        await withTempDir(async (dir) => {
            const storageDir = join(dir, 'opencode', 'storage')
            mkdirSync(join(storageDir, 'session', 'bucket'), { recursive: true })
            mkdirSync(join(storageDir, 'message', 'session-1'), { recursive: true })
            mkdirSync(join(storageDir, 'part', 'message-1'), { recursive: true })

            expect([
                ...resolveWatchDirectories({
                    storageDir,
                    activeSessionId: 'session-1',
                    activeStorageSource: 'files',
                    messageIds: ['message-1'],
                }),
            ]).toEqual(
                expect.arrayContaining([
                    resolve(storageDir),
                    resolve(storageDir, '..'),
                    resolve(storageDir, 'session'),
                    resolve(storageDir, 'session', 'bucket'),
                    resolve(storageDir, 'message'),
                    resolve(storageDir, 'message', 'session-1'),
                    resolve(storageDir, 'part'),
                    resolve(storageDir, 'part', 'message-1'),
                ])
            )
        })
    })
})
