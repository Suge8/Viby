/**
 * Sync Engine for VIBY Hub (Direct Connect)
 *
 * In the direct-connect architecture:
 * - viby-hub is the hub (Socket.IO + REST)
 * - viby CLI connects directly to the hub (no relay)
 * - No E2E encryption; data is stored as JSON in SQLite
 */

import {
    getSessionActivityKind,
    shouldMessageAdvanceSessionUpdatedAt
} from '@viby/protocol'
import type {
    CodexCollaborationMode,
    DecryptedMessage,
    PermissionMode,
    Session,
    SessionRecoveryPage,
    SessionMessageActivity,
    SyncEvent
} from '@viby/protocol/types'
import type { Server } from 'socket.io'
import type { Store } from '../store'
import type { RpcRegistry } from '../socket/rpcRegistry'
import { EventPublisher, type SyncEventBroadcaster, type SyncEventListener } from './eventPublisher'
import { MachineCache, type Machine } from './machineCache'
import { MessageService } from './messageService'
import {
    RpcGateway,
    type RpcCommandResponse,
    type RpcDeleteUploadResponse,
    type RpcListDirectoryResponse,
    type RpcMachineDirectoryResponse,
    type RpcPathExistsResponse,
    type RpcReadFileResponse,
    type RpcUploadFileResponse
} from './rpcGateway'
import { SessionCache } from './sessionCache'
import {
    SessionLifecycleService,
    type ResumeContractState,
    type ResumeSessionResult
} from './sessionLifecycleService'

export type { Session, SyncEvent } from '@viby/protocol/types'
export type { Machine } from './machineCache'
export type { SyncEventListener } from './eventPublisher'
export type {
    RpcCommandResponse,
    RpcDeleteUploadResponse,
    RpcListDirectoryResponse,
    RpcMachineDirectoryResponse,
    RpcPathExistsResponse,
    RpcReadFileResponse,
    RpcUploadFileResponse
} from './rpcGateway'

export class SyncEngine {
    private readonly eventPublisher: EventPublisher
    private readonly sessionCache: SessionCache
    private readonly machineCache: MachineCache
    private readonly messageService: MessageService
    private readonly rpcGateway: RpcGateway
    private readonly sessionLifecycleService: SessionLifecycleService
    private inactivityTimer: NodeJS.Timeout | null = null

    constructor(
        store: Store,
        io: Server,
        rpcRegistry: RpcRegistry,
        broadcaster: SyncEventBroadcaster
    ) {
        this.eventPublisher = new EventPublisher(broadcaster)
        this.sessionCache = new SessionCache(store, this.eventPublisher)
        this.machineCache = new MachineCache(store, this.eventPublisher)
        this.messageService = new MessageService(store, io, this.eventPublisher)
        this.rpcGateway = new RpcGateway(io, rpcRegistry)
        this.sessionLifecycleService = new SessionLifecycleService(
            this.sessionCache,
            this.machineCache,
            this.rpcGateway
        )
        this.reloadAll()
        this.inactivityTimer = setInterval(() => this.expireInactive(), 5_000)
    }

    stop(): void {
        if (this.inactivityTimer) {
            clearInterval(this.inactivityTimer)
            this.inactivityTimer = null
        }
    }

    subscribe(listener: SyncEventListener): () => void {
        return this.eventPublisher.subscribe(listener)
    }

    getSessions(): Session[] {
        return this.sessionCache.getSessions()
    }

    getSession(sessionId: string): Session | undefined {
        return this.sessionCache.getSession(sessionId) ?? this.sessionCache.refreshSession(sessionId) ?? undefined
    }

    getActiveSessions(): Session[] {
        return this.sessionCache.getActiveSessions()
    }

    getMachines(): Machine[] {
        return this.machineCache.getMachines()
    }

    getMachine(machineId: string): Machine | undefined {
        return this.machineCache.getMachine(machineId)
    }

    getOnlineMachines(): Machine[] {
        return this.machineCache.getOnlineMachines()
    }

    getMessagesPage(sessionId: string, options: { limit: number; beforeSeq: number | null }): {
        messages: DecryptedMessage[]
        page: {
            limit: number
            beforeSeq: number | null
            nextBeforeSeq: number | null
            hasMore: boolean
        }
    } {
        return this.messageService.getMessagesPage(sessionId, options)
    }

    getMessagesAfter(sessionId: string, options: { afterSeq: number; limit: number }): DecryptedMessage[] {
        return this.messageService.getMessagesAfter(sessionId, options)
    }

    getSessionRecoveryPage(sessionId: string, options: { afterSeq: number; limit: number }): SessionRecoveryPage {
        const session = this.getSession(sessionId)
        if (!session) {
            throw new Error('Session not found')
        }

        const messages = this.messageService.getMessagesAfter(sessionId, options)
        const nextAfterSeq = messages.reduce((cursor, message) => {
            if (typeof message.seq === 'number' && message.seq > cursor) {
                return message.seq
            }
            return cursor
        }, options.afterSeq)

        return {
            session,
            messages,
            page: {
                afterSeq: options.afterSeq,
                nextAfterSeq,
                limit: options.limit,
                hasMore: messages.length >= options.limit
            }
        }
    }

    getSessionMessageActivities(sessionIds: string[]): Record<string, SessionMessageActivity> {
        return this.messageService.getSessionMessageActivities(sessionIds)
    }

    handleRealtimeEvent(event: SyncEvent): void {
        if (event.type === 'session-updated' && event.sessionId) {
            this.sessionCache.refreshSession(event.sessionId)
            return
        }

        if (event.type === 'machine-updated' && event.machineId) {
            this.machineCache.refreshMachine(event.machineId)
            return
        }

        if (event.type === 'message-received' && event.sessionId) {
            const cachedSession = this.sessionCache.getSession(event.sessionId)
            const activityKind = getSessionActivityKind(event.message.content)
            if (!cachedSession || shouldMessageAdvanceSessionUpdatedAt(activityKind)) {
                this.sessionCache.refreshSession(event.sessionId)
            }
        }

        this.eventPublisher.emit(event)
    }

    handleSessionAlive(payload: {
        sid: string
        time: number
        thinking?: boolean
        mode?: 'local' | 'remote'
        permissionMode?: PermissionMode
        model?: string | null
        modelReasoningEffort?: Session['modelReasoningEffort']
        collaborationMode?: CodexCollaborationMode
    }): void {
        this.sessionCache.handleSessionAlive(payload)
    }

    handleSessionEnd(payload: { sid: string; time: number }): void {
        this.sessionCache.handleSessionEnd(payload)
    }

    handleMachineAlive(payload: { machineId: string; time: number }): void {
        this.machineCache.handleMachineAlive(payload)
    }

    private expireInactive(): void {
        this.sessionCache.expireInactive()
        this.machineCache.expireInactive()
    }

    private reloadAll(): void {
        this.sessionCache.reloadAll()
        this.machineCache.reloadAll()
    }

    getOrCreateSession(
        tag: string,
        metadata: unknown,
        agentState: unknown,
        model?: string,
        modelReasoningEffort?: Session['modelReasoningEffort'],
        permissionMode?: PermissionMode,
        collaborationMode?: CodexCollaborationMode,
        sessionId?: string
    ): Session {
        return this.sessionCache.getOrCreateSession(
            tag,
            metadata,
            agentState,
            model,
            modelReasoningEffort,
            permissionMode,
            collaborationMode,
            sessionId
        )
    }

    getOrCreateMachine(id: string, metadata: unknown, runnerState: unknown): Machine {
        return this.machineCache.getOrCreateMachine(id, metadata, runnerState)
    }

    async sendMessage(
        sessionId: string,
        payload: {
            text: string
            localId?: string | null
            attachments?: Array<{
                id: string
                filename: string
                mimeType: string
                size: number
                path: string
                previewUrl?: string
            }>
            sentFrom?: 'webapp'
        }
    ): Promise<void> {
        await this.messageService.sendMessage(sessionId, payload)
        this.sessionCache.refreshSession(sessionId)
    }

    async approvePermission(
        sessionId: string,
        requestId: string,
        mode?: PermissionMode,
        allowTools?: string[],
        decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort',
        answers?: Record<string, string[]> | Record<string, { answers: string[] }>
    ): Promise<void> {
        await this.rpcGateway.approvePermission(sessionId, requestId, mode, allowTools, decision, answers)
    }

    async denyPermission(
        sessionId: string,
        requestId: string,
        decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort'
    ): Promise<void> {
        await this.rpcGateway.denyPermission(sessionId, requestId, decision)
    }

    async abortSession(sessionId: string): Promise<void> {
        await this.rpcGateway.abortSession(sessionId)
    }

    async closeSession(sessionId: string): Promise<Session> {
        return await this.sessionLifecycleService.closeSession(sessionId)
    }

    async archiveSession(sessionId: string): Promise<Session> {
        return await this.sessionLifecycleService.archiveSession(sessionId)
    }

    async unarchiveSession(sessionId: string): Promise<Session> {
        return await this.sessionLifecycleService.unarchiveSession(sessionId)
    }

    async switchSession(sessionId: string, to: 'remote' | 'local'): Promise<void> {
        await this.rpcGateway.switchSession(sessionId, to)
    }

    async renameSession(sessionId: string, name: string): Promise<Session> {
        return await this.sessionCache.renameSession(sessionId, name)
    }

    async deleteSession(sessionId: string): Promise<void> {
        await this.sessionCache.deleteSession(sessionId)
    }

    async applySessionConfig(
        sessionId: string,
        config: {
            permissionMode?: PermissionMode
            model?: string | null
            modelReasoningEffort?: Session['modelReasoningEffort']
            collaborationMode?: CodexCollaborationMode
        }
    ): Promise<void> {
        const result = await this.rpcGateway.requestSessionConfig(sessionId, config)
        if (!result || typeof result !== 'object') {
            throw new Error('Invalid response from session config RPC')
        }
        const obj = result as {
            applied?: {
                permissionMode?: Session['permissionMode']
                model?: Session['model']
                modelReasoningEffort?: Session['modelReasoningEffort']
                collaborationMode?: Session['collaborationMode']
            }
        }
        const applied = obj.applied
        if (!applied || typeof applied !== 'object') {
            throw new Error('Missing applied session config')
        }

        this.sessionCache.applySessionConfig(sessionId, applied)
    }

    async spawnSession(options: {
        sessionId?: string
        machineId: string
        directory: string
        agent?: 'claude' | 'codex' | 'cursor' | 'gemini' | 'opencode'
        model?: string
        modelReasoningEffort?: Session['modelReasoningEffort']
        permissionMode?: PermissionMode
        sessionType?: 'simple' | 'worktree'
        worktreeName?: string
        resumeSessionId?: string
        collaborationMode?: CodexCollaborationMode
    }): Promise<{ type: 'success'; sessionId: string } | { type: 'error'; message: string }> {
        return await this.rpcGateway.spawnSession(options)
    }

    private async cleanupFailedResumeSpawn(
        originalSessionId: string,
        spawnedSessionId: string,
        resumeToken: string
    ): Promise<string | null> {
        return await this.sessionLifecycleService.defaultCleanupFailedResumeSpawn(
            originalSessionId,
            spawnedSessionId,
            resumeToken
        )
    }

    private async waitForResumedSessionContract(
        sessionId: string,
        resumeToken: string,
        timeoutMs?: number
    ): Promise<ResumeContractState> {
        return await this.sessionLifecycleService.defaultWaitForResumedSessionContract(
            sessionId,
            resumeToken,
            timeoutMs
        )
    }

    private async writeSessionResumeToken(sessionId: string, token: string | undefined): Promise<void> {
        await this.sessionLifecycleService.defaultWriteSessionResumeToken(sessionId, token)
    }

    async resumeSession(sessionId: string): Promise<ResumeSessionResult> {
        return await this.sessionLifecycleService.resumeSession(sessionId, {
            cleanupFailedResumeSpawn: async (originalSessionId, spawnedSessionId, resumeToken) => {
                return await this.cleanupFailedResumeSpawn(
                    originalSessionId,
                    spawnedSessionId,
                    resumeToken
                )
            },
            waitForResumedSessionContract: async (targetSessionId, resumeToken, timeoutMs) => {
                return await this.waitForResumedSessionContract(
                    targetSessionId,
                    resumeToken,
                    timeoutMs
                )
            },
            writeSessionResumeToken: async (targetSessionId, token) => {
                await this.writeSessionResumeToken(targetSessionId, token)
            }
        })
    }

    async checkPathsExist(machineId: string, paths: string[]): Promise<Record<string, boolean>> {
        return await this.rpcGateway.checkPathsExist(machineId, paths)
    }

    async browseMachineDirectory(machineId: string, path?: string): Promise<RpcMachineDirectoryResponse> {
        return await this.rpcGateway.browseMachineDirectory(machineId, path)
    }

    async getGitStatus(sessionId: string, cwd?: string): Promise<RpcCommandResponse> {
        return await this.rpcGateway.getGitStatus(sessionId, cwd)
    }

    async getGitDiffNumstat(sessionId: string, options: { cwd?: string; staged?: boolean }): Promise<RpcCommandResponse> {
        return await this.rpcGateway.getGitDiffNumstat(sessionId, options)
    }

    async getGitDiffFile(sessionId: string, options: { cwd?: string; filePath: string; staged?: boolean }): Promise<RpcCommandResponse> {
        return await this.rpcGateway.getGitDiffFile(sessionId, options)
    }

    async readSessionFile(sessionId: string, path: string): Promise<RpcReadFileResponse> {
        return await this.rpcGateway.readSessionFile(sessionId, path)
    }

    async listDirectory(sessionId: string, path: string): Promise<RpcListDirectoryResponse> {
        return await this.rpcGateway.listDirectory(sessionId, path)
    }

    async uploadFile(sessionId: string, filename: string, content: string, mimeType: string): Promise<RpcUploadFileResponse> {
        return await this.rpcGateway.uploadFile(sessionId, filename, content, mimeType)
    }

    async deleteUploadFile(sessionId: string, path: string): Promise<RpcDeleteUploadResponse> {
        return await this.rpcGateway.deleteUploadFile(sessionId, path)
    }

    async runRipgrep(sessionId: string, args: string[], cwd?: string): Promise<RpcCommandResponse> {
        return await this.rpcGateway.runRipgrep(sessionId, args, cwd)
    }

    async listSlashCommands(sessionId: string, agent: string): Promise<{
        success: boolean
        commands?: Array<{ name: string; description?: string; source: 'builtin' | 'user' | 'plugin' | 'project' }>
        error?: string
    }> {
        return await this.rpcGateway.listSlashCommands(sessionId, agent)
    }

    async listSkills(sessionId: string): Promise<{
        success: boolean
        skills?: Array<{ name: string; description?: string }>
        error?: string
    }> {
        return await this.rpcGateway.listSkills(sessionId)
    }
}
