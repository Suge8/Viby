import { describe, expect, it } from 'bun:test'
import type { PairingPeerRequest } from '@viby/protocol/pairing'
import { executePairingPeerRequest, parsePairingPeerRequest, serializePairingPeerMessage } from './pairingPeerRpcCore'

function parseRequest(payload: PairingPeerRequest) {
    return parsePairingPeerRequest(JSON.stringify(payload))
}

function createSessionRecord(id: string) {
    return {
        id,
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: true,
        activeAt: 1,
        metadata: {
            name: `${id} name`,
            path: `/tmp/${id}`,
            host: 'localhost',
            driver: 'codex' as const,
        },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 0,
        thinking: false,
        thinkingAt: 1,
        model: 'gpt-5.4',
        codexServiceTier: null,
        modelReasoningEffort: 'high' as const,
        permissionMode: 'safe-yolo' as const,
        collaborationMode: 'default' as const,
        resumeAvailable: true,
    }
}

function createSessionView(id: string) {
    return {
        session: createSessionRecord(id),
        latestWindow: {
            messages: [],
            page: {
                limit: 50,
                beforeSeq: null,
                nextBeforeSeq: null,
                hasMore: false,
            },
        },
        stream: null,
        watermark: {
            latestSeq: 0,
            updatedAt: 1,
        },
        interactivity: {
            lifecycleState: 'running' as const,
            resumeAvailable: true,
            allowSendWhenInactive: false,
            retryAvailable: false,
        },
    }
}

describe('pairingBridgeCore extra request coverage', () => {
    it('maps session.open onto the local Hub client and preserves legacy full snapshots by default', async () => {
        const view = createSessionView('session-opened')
        const client = {
            openSession: async (sessionId: string) => {
                expect(sessionId).toBe('session-opened')
                return view
            },
        }

        await expect(
            executePairingPeerRequest(
                client as never,
                parseRequest({
                    kind: 'request',
                    id: 'req-open',
                    method: 'session.open',
                    params: { sessionId: 'session-opened' },
                })
            )
        ).resolves.toMatchObject({
            kind: 'response',
            id: 'req-open',
            ok: true,
            result: view,
        })
    })

    it('omits the latest window when remote open requests lazy messages', async () => {
        const view = {
            ...createSessionView('session-opened'),
            latestWindow: {
                messages: [{ id: 'm-large' }],
                page: { limit: 50, beforeSeq: null, nextBeforeSeq: null, hasMore: false },
            },
        }
        const response = await executePairingPeerRequest(
            { openSession: async () => view } as never,
            parseRequest({
                kind: 'request',
                id: 'req-open',
                method: 'session.open',
                params: { sessionId: 'session-opened', includeLatestWindow: false },
            })
        )

        expect(response).toMatchObject({ id: 'req-open', ok: true, result: { session: { id: 'session-opened' } } })
        expect(response.ok && 'latestWindow' in response.result).toBe(false)
    })

    it('maps session.resume and message paging through the same bridge contract', async () => {
        const resumedView = {
            ...createSessionView('session-resume'),
            latestWindow: {
                messages: [
                    {
                        id: 'm-1',
                        seq: 1,
                        localId: 'local-1',
                        createdAt: 1,
                        sessionId: 'session-resume',
                        kind: 'user',
                        content: 'hello',
                    },
                ],
                page: {
                    limit: 50,
                    beforeSeq: null,
                    nextBeforeSeq: null,
                    hasMore: false,
                },
            },
        }
        const client = {
            resumeSession: async (sessionId: string) => {
                expect(sessionId).toBe('session-resume')
                return resumedView
            },
            getMessages: async (
                sessionId: string,
                options: { beforeSeq?: number | null; afterSeq?: number | null; limit?: number }
            ) => {
                expect(sessionId).toBe('session-resume')
                expect(options).toEqual({ sessionId: 'session-resume', beforeSeq: null, limit: 25 })
                return {
                    messages: [
                        {
                            id: 'm-latest',
                            seq: 43,
                            localId: 'local-latest',
                            createdAt: 3,
                            sessionId: 'session-resume',
                            kind: 'assistant',
                            content: 'latest',
                        },
                    ],
                    page: { limit: 25, beforeSeq: null, nextBeforeSeq: null, hasMore: false },
                }
            },
            loadMessagesAfter: async (sessionId: string, afterSeq: number, limit: number) => {
                expect(sessionId).toBe('session-resume')
                expect(afterSeq).toBe(41)
                expect(limit).toBe(25)
                return {
                    messages: [
                        {
                            id: 'm-2',
                            seq: 42,
                            localId: 'local-2',
                            createdAt: 2,
                            sessionId: 'session-resume',
                            kind: 'assistant',
                            content: 'reply',
                        },
                    ],
                    nextAfterSeq: 42,
                }
            },
        }

        const resumeResponse = await executePairingPeerRequest(
            client as never,
            parseRequest({
                kind: 'request',
                id: 'req-resume',
                method: 'session.resume',
                params: { sessionId: 'session-resume' },
            })
        )

        expect(resumeResponse).toMatchObject({
            id: 'req-resume',
            ok: true,
            result: {
                session: {
                    id: 'session-resume',
                    metadata: {
                        path: '/tmp/session-resume',
                    },
                },
                latestWindow: {
                    messages: [{ id: 'm-1' }],
                },
            },
        })

        await expect(
            executePairingPeerRequest(
                client as never,
                parseRequest({
                    kind: 'request',
                    id: 'req-messages',
                    method: 'session.messages',
                    params: { sessionId: 'session-resume', beforeSeq: null, limit: 25 },
                })
            )
        ).resolves.toMatchObject({
            id: 'req-messages',
            ok: true,
            result: { messages: [{ id: 'm-latest', seq: 43 }] },
        })

        await expect(
            executePairingPeerRequest(
                client as never,
                parseRequest({
                    kind: 'request',
                    id: 'req-load-after',
                    method: 'session.load-after',
                    params: { sessionId: 'session-resume', afterSeq: 41, limit: 25 },
                })
            )
        ).resolves.toMatchObject({
            id: 'req-load-after',
            ok: true,
            result: {
                messages: [{ id: 'm-2', seq: 42 }],
                nextAfterSeq: 42,
            },
        })
    })

    it('maps session.send into the authoritative send path and returns the refreshed session view', async () => {
        const refreshedSession = createSessionRecord('session-send')
        const client = {
            sendMessage: async (sessionId: string, text: string, localId: string) => {
                expect(sessionId).toBe('session-send')
                expect(text).toBe('hello from phone')
                expect(localId).toBe('mobile-1')
                return refreshedSession
            },
        }

        await expect(
            executePairingPeerRequest(
                client as never,
                parseRequest({
                    kind: 'request',
                    id: 'req-send',
                    method: 'session.send',
                    params: {
                        sessionId: 'session-send',
                        text: 'hello from phone',
                        localId: 'mobile-1',
                    },
                })
            )
        ).resolves.toMatchObject({
            id: 'req-send',
            ok: true,
            result: {
                session: {
                    id: refreshedSession.id,
                    metadata: {
                        path: refreshedSession.metadata.path,
                    },
                },
            },
        })
    })

    it('maps runtime project creation requests through the desktop Hub owner', async () => {
        const createdSession = createSessionRecord('session-created')
        const version = {
            status: 'supported' as const,
            supportedVersion: '0.130.0',
            source: 'test',
            installedVersion: '0.130.0',
            checkedAt: 1,
        }
        const client = {
            getRuntimeAgentAvailability: async (input: { directory?: string }) => {
                expect(input).toEqual({ directory: '/repo' })
                return { agents: [] }
            },
            getAgentConfig: async () => ({
                agents: [
                    {
                        driver: 'codex' as const,
                        path: '/home/user/.codex/config.toml',
                        exists: true,
                        values: {},
                        version,
                    },
                ],
            }),
            saveAgentConfig: async (input: { driver: string; values: Record<string, unknown> }) => {
                expect(input).toEqual({ driver: 'codex', values: { 'codex.model': 'gpt-5.4' } })
                return {
                    agent: {
                        driver: 'codex' as const,
                        path: '/home/user/.codex/config.toml',
                        exists: true,
                        values: input.values,
                        version,
                    },
                }
            },
            restoreAgentConfig: async (input: { driver: string; backupPath: string }) => {
                expect(input).toEqual({ driver: 'codex', backupPath: '/tmp/config.bak' })
                return {
                    agent: {
                        driver: 'codex' as const,
                        path: '/home/user/.codex/config.toml',
                        exists: true,
                        values: { 'codex.model': 'gpt-5.2' },
                        version,
                    },
                }
            },
            openAgentConfig: async (input: { driver: string }) => {
                expect(input).toEqual({ driver: 'codex' })
                return { ok: true as const, path: '/home/user/.codex/config.toml' }
            },
            checkRuntimePathsExists: async (paths: string[]) => {
                expect(paths).toEqual(['/repo'])
                return { exists: { '/repo': true } }
            },
            browseRuntimeDirectory: async (path?: string) => {
                expect(path).toBe('/repo')
                return {
                    success: true,
                    currentPath: '/repo',
                    parentPath: null,
                    entries: [{ name: 'app', path: '/repo/app', type: 'directory' as const }],
                    roots: [],
                }
            },
            resolveAgentLaunchConfig: async (input: { agent: string; directory: string }) => {
                expect(input).toEqual({ agent: 'codex', directory: '/repo' })
                return { type: 'error' as const, message: 'missing model' }
            },
            spawnSession: async (input: { agent?: string; directory: string }) => {
                expect(input).toEqual({ agent: 'codex', directory: '/repo' })
                return { type: 'success' as const, session: createdSession }
            },
        }

        await expect(
            executePairingPeerRequest(
                client as never,
                parseRequest({
                    kind: 'request',
                    id: 'runtime-availability',
                    method: 'runtime.agent-availability',
                    params: { directory: '/repo' },
                })
            )
        ).resolves.toMatchObject({ ok: true, result: { agents: [] } })

        await expect(
            executePairingPeerRequest(
                client as never,
                parseRequest({
                    kind: 'request',
                    id: 'runtime-agent-config',
                    method: 'runtime.agent-config',
                    params: {},
                })
            )
        ).resolves.toMatchObject({ ok: true, result: { agents: [{ driver: 'codex' }] } })

        await expect(
            executePairingPeerRequest(
                client as never,
                parseRequest({
                    kind: 'request',
                    id: 'runtime-save-agent-config',
                    method: 'runtime.save-agent-config',
                    params: { driver: 'codex', values: { 'codex.model': 'gpt-5.4' } },
                })
            )
        ).resolves.toMatchObject({ ok: true, result: { agent: { driver: 'codex' } } })

        await expect(
            executePairingPeerRequest(
                client as never,
                parseRequest({
                    kind: 'request',
                    id: 'runtime-open-agent-config',
                    method: 'runtime.open-agent-config',
                    params: { driver: 'codex' },
                })
            )
        ).resolves.toMatchObject({ ok: true, result: { ok: true, path: '/home/user/.codex/config.toml' } })

        await expect(
            executePairingPeerRequest(
                client as never,
                parseRequest({
                    kind: 'request',
                    id: 'runtime-restore-agent-config',
                    method: 'runtime.restore-agent-config',
                    params: { driver: 'codex', backupPath: '/tmp/config.bak' },
                })
            )
        ).resolves.toMatchObject({ ok: true, result: { agent: { driver: 'codex' } } })

        await expect(
            executePairingPeerRequest(
                client as never,
                parseRequest({
                    kind: 'request',
                    id: 'runtime-paths',
                    method: 'runtime.paths-exists',
                    params: { paths: ['/repo'] },
                })
            )
        ).resolves.toMatchObject({ ok: true, result: { exists: { '/repo': true } } })

        await expect(
            executePairingPeerRequest(
                client as never,
                parseRequest({
                    kind: 'request',
                    id: 'runtime-browse',
                    method: 'runtime.browse-directory',
                    params: { path: '/repo' },
                })
            )
        ).resolves.toMatchObject({ ok: true, result: { success: true, currentPath: '/repo' } })

        await expect(
            executePairingPeerRequest(
                client as never,
                parseRequest({
                    kind: 'request',
                    id: 'runtime-config',
                    method: 'runtime.agent-launch-config',
                    params: { agent: 'codex', directory: '/repo' },
                })
            )
        ).resolves.toMatchObject({ ok: true, result: { type: 'error', message: 'missing model' } })

        await expect(
            executePairingPeerRequest(
                client as never,
                parseRequest({
                    kind: 'request',
                    id: 'runtime-spawn',
                    method: 'runtime.spawn',
                    params: { agent: 'codex', directory: '/repo' },
                })
            )
        ).resolves.toMatchObject({ ok: true, result: { type: 'success', session: { id: 'session-created' } } })
    })

    it('maps mobile management and workspace requests through the local Hub owner', async () => {
        const closedSession = { ...createSessionRecord('session-control'), active: false }
        const client = {
            closeSession: async (sessionId: string) => {
                expect(sessionId).toBe('session-control')
                return closedSession
            },
            renameSession: async (sessionId: string, name: string) => {
                expect([sessionId, name]).toEqual(['session-control', 'Renamed'])
                return { ...closedSession, metadata: { ...closedSession.metadata, name } }
            },
            getGitStatus: async (sessionId: string) => {
                expect(sessionId).toBe('session-control')
                return { success: true, stdout: ' M file.ts' }
            },
            readSessionFile: async (sessionId: string, path: string) => {
                expect([sessionId, path]).toEqual(['session-control', 'file.ts'])
                return { success: true, content: 'hello' }
            },
        }

        await expect(
            executePairingPeerRequest(
                client as never,
                parseRequest({
                    kind: 'request',
                    id: 'control-close',
                    method: 'session.close',
                    params: { sessionId: 'session-control' },
                })
            )
        ).resolves.toMatchObject({ ok: true, result: { session: { id: 'session-control', active: false } } })

        await expect(
            executePairingPeerRequest(
                client as never,
                parseRequest({
                    kind: 'request',
                    id: 'control-rename',
                    method: 'session.rename',
                    params: { sessionId: 'session-control', name: 'Renamed' },
                })
            )
        ).resolves.toMatchObject({ ok: true, result: { session: { metadata: { name: 'Renamed' } } } })

        await expect(
            executePairingPeerRequest(
                client as never,
                parseRequest({
                    kind: 'request',
                    id: 'workspace-status',
                    method: 'workspace.git-status',
                    params: { sessionId: 'session-control' },
                })
            )
        ).resolves.toMatchObject({ ok: true, result: { success: true, stdout: ' M file.ts' } })

        await expect(
            executePairingPeerRequest(
                client as never,
                parseRequest({
                    kind: 'request',
                    id: 'workspace-read',
                    method: 'workspace.read-file',
                    params: { sessionId: 'session-control', path: 'file.ts' },
                })
            )
        ).resolves.toMatchObject({ ok: true, result: { success: true, content: 'hello' } })
    })

    it('returns a typed pairing error payload when the local Hub request fails', async () => {
        const client = {
            openSession: async () => {
                throw new Error('desktop hub offline')
            },
        }

        await expect(
            executePairingPeerRequest(
                client as never,
                parseRequest({
                    kind: 'request',
                    id: 'req-error',
                    method: 'session.open',
                    params: { sessionId: 'session-error' },
                })
            )
        ).resolves.toMatchObject({
            id: 'req-error',
            ok: false,
            error: {
                code: 'pairing_peer_request_failed',
                message: 'desktop hub offline',
            },
        })
    })

    it('serializes successful peer responses through the shared envelope schema', () => {
        expect(
            JSON.parse(
                serializePairingPeerMessage({
                    kind: 'response',
                    id: 'req-serialized',
                    ok: true,
                    result: {
                        sessions: [],
                    },
                })
            )
        ).toEqual({
            kind: 'response',
            id: 'req-serialized',
            ok: true,
            result: {
                sessions: [],
            },
        })
    })

    it('routes upload, terminal and push requests to the desktop Local Hub owner', async () => {
        const terminalEvents: unknown[] = []
        const client = {
            beginUpload: (params: { transferId: string }) => {
                expect(params.transferId).toBe('00000000-0000-4000-8000-000000000001')
            },
            completeUpload: async () => ({ success: true, path: '/tmp/uploaded.png' }),
            openTerminal: async (_params: unknown, emit: (event: unknown) => void) => {
                emit({ type: 'ready', terminalId: 'terminal-1' })
            },
            writeTerminal: (sessionId: string, terminalId: string, data: string) => {
                expect({ sessionId, terminalId, data }).toEqual({
                    sessionId: 'session-1',
                    terminalId: 'terminal-1',
                    data: 'ls\n',
                })
            },
            getPushVapidPublicKey: async () => ({ publicKey: 'vapid' }),
            subscribePushNotifications: async (params: { endpoint: string }) => {
                expect(params.endpoint).toBe('https://push.example')
            },
        }

        await expect(
            executePairingPeerRequest(
                client as never,
                parseRequest({
                    kind: 'request',
                    id: 'upload-start',
                    method: 'session.upload-start',
                    params: {
                        sessionId: 'session-1',
                        transferId: '00000000-0000-4000-8000-000000000001',
                        filename: 'image.png',
                        mimeType: 'image/png',
                        size: 1,
                    },
                })
            )
        ).resolves.toMatchObject({ ok: true })
        await expect(
            executePairingPeerRequest(
                client as never,
                parseRequest({
                    kind: 'request',
                    id: 'upload-complete',
                    method: 'session.upload-complete',
                    params: { sessionId: 'session-1', transferId: '00000000-0000-4000-8000-000000000001' },
                })
            )
        ).resolves.toMatchObject({ ok: true, result: { success: true } })
        await executePairingPeerRequest(
            client as never,
            parseRequest({
                kind: 'request',
                id: 'terminal-open',
                method: 'terminal.open',
                params: { sessionId: 'session-1', terminalId: 'terminal-1', cols: 80, rows: 24 },
            }),
            { emitTerminalEvent: (event) => terminalEvents.push(event) }
        )
        await executePairingPeerRequest(
            client as never,
            parseRequest({
                kind: 'request',
                id: 'terminal-write',
                method: 'terminal.write',
                params: { sessionId: 'session-1', terminalId: 'terminal-1', data: 'ls\n' },
            })
        )
        await expect(
            executePairingPeerRequest(
                client as never,
                parseRequest({ kind: 'request', id: 'push-key', method: 'push.vapid-public-key', params: {} })
            )
        ).resolves.toMatchObject({ ok: true, result: { publicKey: 'vapid' } })
        await executePairingPeerRequest(
            client as never,
            parseRequest({
                kind: 'request',
                id: 'push-subscribe',
                method: 'push.subscribe',
                params: { endpoint: 'https://push.example', keys: { p256dh: 'p', auth: 'a' } },
            })
        )
        expect(terminalEvents).toEqual([{ type: 'ready', terminalId: 'terminal-1' }])
    })
})
