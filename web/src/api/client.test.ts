// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '@/types/api'
import { ApiClient } from './client'

function jsonResponse(body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
    })
}

function createSession(id: string = 'session-1'): Session {
    return {
        id,
        seq: 1,
        createdAt: 1_000,
        updatedAt: 1_000,
        active: true,
        activeAt: 1_000,
        metadata: {
            path: '/tmp/project',
            host: 'localhost',
            driver: 'codex',
            machineId: 'machine-1',
            lifecycleState: 'running',
            lifecycleStateSince: 1_000,
        },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 0,
        thinking: false,
        thinkingAt: 1_000,
        model: 'gpt-5.4',
        modelReasoningEffort: 'high',
        permissionMode: 'safe-yolo',
        collaborationMode: 'default',
        todos: undefined,
    }
}

afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
})

beforeEach(() => {
    vi.useFakeTimers()
})

describe('ApiClient runtime methods', () => {
    it('gives spawn requests enough budget to outlive the default deadline', async () => {
        const session = createSession()
        vi.stubGlobal(
            'fetch',
            vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
                if (!String(input).includes('/api/runtime/spawn')) {
                    throw new Error(`Unexpected fetch: ${String(input)}`)
                }

                expect(init?.method).toBe('POST')
                expect(JSON.parse(String(init?.body))).toMatchObject({
                    directory: '/tmp/project',
                    agent: 'claude',
                })

                await vi.advanceTimersByTimeAsync(16_000)
                return jsonResponse({ type: 'success', session })
            })
        )

        const api = new ApiClient('token')
        await expect(
            api.spawnSession({
                directory: '/tmp/project',
                agent: 'claude',
            })
        ).resolves.toEqual({
            type: 'success',
            session,
        })
    })

    it('normalizes legacy spawn success responses by fetching the authoritative session snapshot', async () => {
        const session = createSession()
        vi.stubGlobal(
            'fetch',
            vi.fn(async (input: RequestInfo | URL) => {
                const url = String(input)
                if (url.includes('/api/runtime/spawn')) {
                    return jsonResponse({ type: 'success', sessionId: session.id })
                }
                if (url.includes(`/api/sessions/${session.id}`)) {
                    return jsonResponse({ session })
                }
                throw new Error(`Unexpected fetch: ${url}`)
            })
        )

        const api = new ApiClient('token')
        await expect(
            api.spawnSession({
                directory: '/tmp/project',
                agent: 'codex',
            })
        ).resolves.toEqual({
            type: 'success',
            session,
        })
    })

    it('uploads attachment files as multipart form data without forcing a JSON content type', async () => {
        const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input)
            if (!url.includes('/api/sessions/session-1/upload')) {
                throw new Error(`Unexpected fetch: ${url}`)
            }

            expect(init?.method).toBe('POST')
            expect(init?.body).toBeInstanceOf(FormData)
            expect(new Headers(init?.headers).has('content-type')).toBe(false)
            return jsonResponse({ success: true, path: '/tmp/photo.heic' })
        })
        vi.stubGlobal('fetch', fetchMock)

        const api = new ApiClient('token')
        const file = new File(['photo'], 'photo.heic', { type: '' })
        await expect(api.uploadFile('session-1', file, 'image/heic')).resolves.toEqual({
            success: true,
            path: '/tmp/photo.heic',
        })
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })
})
