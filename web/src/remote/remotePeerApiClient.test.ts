import { describe, expect, it, vi } from 'vitest'
import { queryKeys } from '@/lib/query-keys'
import { createApiHarness } from './remotePeerApiClient.test.support'

describe('createRemotePeerApiClient', () => {
    it('overwrites stale local runtime cache with the synthetic remote runtime', () => {
        const { queryClient } = createApiHarness()
        expect(queryClient.getQueryData(queryKeys.runtime)).toMatchObject({
            runtime: { id: 'remote-p2p', active: true },
        })
    })

    it('maps remote session summaries into the normal SessionsResponse contract', async () => {
        const { api, queryClient } = createApiHarness()

        const response = await api.getSessions()

        expect(response.sessions).toHaveLength(1)
        expect(response.sessions[0]).toMatchObject({
            id: 'session-1',
            active: true,
            lifecycleState: 'running',
            resumeAvailable: true,
            resumeStrategy: 'transcript-replay',
            metadata: { path: '/repo', name: 'Remote session', driver: 'codex' },
        })
        expect(queryClient.getQueryData(queryKeys.sessions)).toEqual(response)
    })

    it('opens session views through the bridge and hydrates the normal session cache', async () => {
        const { api, bridge, queryClient } = createApiHarness()

        const view = await api.getSessionView('session-1')

        expect(view.session.id).toBe('session-1')
        expect(bridge.openSession).toHaveBeenCalledWith({ sessionId: 'session-1' })
        expect(queryClient.getQueryData(queryKeys.session('session-1'))).toMatchObject({
            session: { id: 'session-1' },
            detailHydrated: true,
        })
    })

    it('reuses the opened view for getSession and latest messages', async () => {
        const { api, bridge } = createApiHarness()

        await api.getSessionView('session-1')
        const sessionResponse = await api.getSession('session-1')
        const messagesResponse = await api.getMessages('session-1', { limit: 25 })

        expect(sessionResponse.session.id).toBe('session-1')
        expect(messagesResponse.messages.map((message) => message.id)).toEqual(['message-1'])
        expect(messagesResponse.page).toEqual({ limit: 25, beforeSeq: null, nextBeforeSeq: null, hasMore: false })
        expect(bridge.openSession).toHaveBeenCalledTimes(1)
    })

    it('loads catch-up messages through the peer load-after RPC', async () => {
        const { api, bridge } = createApiHarness()

        const recovery = await api.getSessionRecovery('session-1', { afterSeq: 1, limit: 20 })

        expect(bridge.loadAfter).toHaveBeenCalledWith({ sessionId: 'session-1', afterSeq: 1, limit: 20 })
        expect(recovery.messages.map((message) => message.id)).toEqual(['message-2'])
        expect(recovery.page).toEqual({ afterSeq: 1, nextAfterSeq: 2, limit: 20, hasMore: false })
        expect(recovery.session.id).toBe('session-1')
    })

    it('resumes sessions by hydrating the returned view', async () => {
        const { api, bridge, queryClient } = createApiHarness()

        const session = await api.resumeSession('session-1')

        expect(bridge.resumeSession).toHaveBeenCalledWith({ sessionId: 'session-1' })
        expect(session.updatedAt).toBe(20)
        expect(queryClient.getQueryData(queryKeys.session('session-1'))).toMatchObject({
            session: { updatedAt: 20 },
        })
    })

    it('sends messages through the peer bridge without creating a second Hub client', async () => {
        const { api, bridge } = createApiHarness()

        const session = await api.sendMessage('session-1', 'hello remote', 'local-1')

        expect(bridge.sendMessage).toHaveBeenCalledWith({
            sessionId: 'session-1',
            text: 'hello remote',
            localId: 'local-1',
        })
        expect(session.thinking).toBe(true)
    })

    it('delegates runtime project selection to the desktop bridge', async () => {
        const { api, bridge } = createApiHarness()

        await expect(api.browseRuntimeDirectory('/repo')).resolves.toMatchObject({ success: true })
        await expect(api.checkRuntimePathsExists(['/repo'])).resolves.toEqual({ exists: { '/repo': true } })
        await expect(api.getRuntimeAgentAvailability({ directory: '/repo', forceRefresh: true })).resolves.toEqual({
            agents: [],
        })
        await expect(api.spawnSession({ directory: '/repo', agent: 'codex' })).resolves.toMatchObject({
            type: 'success',
            session: { id: 'session-2' },
        })

        expect(bridge.browseRuntimeDirectory).toHaveBeenCalledWith({ path: '/repo' })
        expect(bridge.checkRuntimePathsExists).toHaveBeenCalledWith({ paths: ['/repo'] })
        expect(bridge.getRuntimeAgentAvailability).toHaveBeenCalledWith({
            directory: '/repo',
            forceRefresh: true,
        })
        expect(bridge.spawnSession).toHaveBeenCalledWith({ directory: '/repo', agent: 'codex' })
    })

    it('honors query abort signals on remote runtime reads', async () => {
        const controller = new AbortController()
        const bridge = createApiHarness().bridge
        vi.mocked(bridge.getRuntimeAgentAvailability).mockReturnValue(new Promise(() => undefined))
        const { api } = createApiHarness(bridge)

        const pending = api.getRuntimeAgentAvailability({ directory: '/repo', signal: controller.signal })
        controller.abort(new Error('stale request'))

        await expect(pending).rejects.toThrow('stale request')
    })

    it('delegates mobile control and workspace operations through the desktop bridge', async () => {
        const { api, bridge } = createApiHarness()

        await expect(api.closeSession('session-1')).resolves.toMatchObject({ id: 'session-1', active: false })
        await expect(api.renameSession('session-1', 'Renamed')).resolves.toMatchObject({
            metadata: { name: 'Renamed' },
        })
        await expect(api.getGitStatus('session-1')).resolves.toEqual({ success: true, stdout: ' M file.ts' })
        await expect(api.readSessionFile('session-1', 'file.ts')).resolves.toEqual({
            success: true,
            content: 'hello',
        })
        await expect(api.uploadFile('session-1', new File(['x'], 'x.png'), 'image/png')).resolves.toEqual({
            success: true,
            path: '/tmp/uploaded.png',
        })
        expect(await api.getCommandCapabilities('session-1')).toEqual({
            success: true,
            revision: 'remote',
            capabilities: [],
        })
        expect(await api.getPushVapidPublicKey()).toEqual({ publicKey: 'vapid-public-key' })
        await api.subscribePushNotifications({ endpoint: 'https://push.example', keys: { p256dh: 'p', auth: 'a' } })
        expect(await api.getRuntime()).toMatchObject({
            runtime: {
                id: 'remote-p2p',
                active: true,
                metadata: { capabilities: ['browse-directory'] },
            },
        })
        expect(bridge.closeSession).toHaveBeenCalledWith({ sessionId: 'session-1' })
        expect(bridge.renameSession).toHaveBeenCalledWith({ sessionId: 'session-1', name: 'Renamed' })
        expect(bridge.uploadFile).toHaveBeenCalledWith('session-1', expect.any(File), 'image/png')
        expect(bridge.subscribePushNotifications).toHaveBeenCalledWith({
            endpoint: 'https://push.example',
            keys: { p256dh: 'p', auth: 'a' },
        })
    })
})
