// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiClient } from './client'
import type { Session } from '@/types/api'

function jsonResponse(body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' }
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
            flavor: 'codex',
            machineId: 'machine-1',
            lifecycleState: 'running',
            lifecycleStateSince: 1_000
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
        teamState: undefined
    }
}

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('ApiClient session snapshot normalization', () => {
    it('forwards manager sessionRole through the spawn request body', async () => {
        const session = createSession('manager-session-1')
        const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input)
            if (url.includes('/api/machines/machine-1/spawn')) {
                expect(init?.method).toBe('POST')
                expect(JSON.parse(String(init?.body))).toMatchObject({
                    directory: '/tmp/project',
                    agent: 'claude',
                    sessionRole: 'manager'
                })
                return jsonResponse({ type: 'success', session })
            }
            throw new Error(`Unexpected fetch: ${url}`)
        })
        vi.stubGlobal('fetch', fetchMock)

        const api = new ApiClient('token')
        const response = await api.spawnSession({
            machineId: 'machine-1',
            directory: '/tmp/project',
            agent: 'claude',
            sessionRole: 'manager'
        })

        expect(response).toEqual({ type: 'success', session })
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('normalizes legacy spawn success responses by fetching the authoritative session snapshot', async () => {
        const session = createSession()
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input)
            if (url.includes('/api/machines/machine-1/spawn')) {
                return jsonResponse({ type: 'success', sessionId: session.id })
            }
            if (url.includes(`/api/sessions/${session.id}`)) {
                return jsonResponse({ session })
            }
            throw new Error(`Unexpected fetch: ${url}`)
        })
        vi.stubGlobal('fetch', fetchMock)

        const api = new ApiClient('token')
        const response = await api.spawnSession({
            machineId: 'machine-1',
            directory: '/tmp/project',
            agent: 'codex'
        })

        expect(response).toEqual({ type: 'success', session })
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('normalizes legacy resume success responses by fetching the authoritative session snapshot', async () => {
        const session = createSession()
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input)
            if (url.includes(`/api/sessions/${session.id}/resume`)) {
                return jsonResponse({ type: 'success', sessionId: session.id })
            }
            if (url.includes(`/api/sessions/${session.id}`)) {
                return jsonResponse({ session })
            }
            throw new Error(`Unexpected fetch: ${url}`)
        })
        vi.stubGlobal('fetch', fetchMock)

        const api = new ApiClient('token')
        const resumedSession = await api.resumeSession(session.id)

        expect(resumedSession).toEqual(session)
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('normalizes legacy live-config success responses by fetching the authoritative session snapshot', async () => {
        const session = createSession()
        const updatedSession = {
            ...session,
            permissionMode: 'read-only' as const
        }
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input)
            if (url.includes(`/api/sessions/${session.id}/permission-mode`)) {
                return jsonResponse({ ok: true })
            }
            if (url.includes(`/api/sessions/${session.id}`)) {
                return jsonResponse({ session: updatedSession })
            }
            throw new Error(`Unexpected fetch: ${url}`)
        })
        vi.stubGlobal('fetch', fetchMock)

        const api = new ApiClient('token')
        const result = await api.setPermissionMode(session.id, 'read-only')

        expect(result).toEqual(updatedSession)
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('normalizes legacy lifecycle success responses by fetching the authoritative session snapshot', async () => {
        const session = createSession()
        const archivedSession = {
            ...session,
            active: false,
            updatedAt: 2_000,
            metadata: {
                ...session.metadata!,
                lifecycleState: 'archived' as const,
                lifecycleStateSince: 2_000
            }
        }
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input)
            if (url.includes(`/api/sessions/${session.id}/archive`)) {
                return jsonResponse({ ok: true })
            }
            if (url.includes(`/api/sessions/${session.id}`)) {
                return jsonResponse({ session: archivedSession })
            }
            throw new Error(`Unexpected fetch: ${url}`)
        })
        vi.stubGlobal('fetch', fetchMock)

        const api = new ApiClient('token')
        const result = await api.archiveSession(session.id)

        expect(result).toEqual(archivedSession)
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })
})
