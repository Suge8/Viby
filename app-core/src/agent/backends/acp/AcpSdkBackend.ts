import { asString, isObject } from '@viby/protocol'
import type {
    AgentBackend,
    AgentMessage,
    AgentSessionConfig,
    PermissionRequest,
    PermissionResponse,
    PromptContent,
} from '@/agent/types'
import { logger } from '@/ui/logger'
import { withRetry } from '@/utils/time'
import packageJson from '../../../../package.json'
import { AcpMessageHandler } from './AcpMessageHandler'
import { type AcpStderrError, AcpStdioTransport } from './AcpStdioTransport'
import { buildAcpPermissionRequest } from './acpPermissionRequest'
import { AcpSessionUpdateTracker } from './acpSessionUpdateTracker'

type PendingPermission = {
    resolve: (result: { outcome: { outcome: string; optionId?: string } }) => void
}

export class AcpSdkBackend implements AgentBackend {
    private transport: AcpStdioTransport | null = null
    private permissionHandler: ((request: PermissionRequest) => void) | null = null
    private stderrErrorHandler: ((error: AcpStderrError) => void) | null = null
    private readonly pendingPermissions = new Map<string, PendingPermission>()
    private messageHandler: AcpMessageHandler | null = null
    private activeSessionId: string | null = null
    private readonly sessionUpdateTracker = new AcpSessionUpdateTracker()

    /** Retry configuration for ACP initialization */
    private static readonly INIT_RETRY_OPTIONS = {
        maxAttempts: 3,
        minDelay: 1000,
        maxDelay: 5000,
    }
    private static readonly UPDATE_QUIET_PERIOD_MS = 120
    private static readonly UPDATE_DRAIN_TIMEOUT_MS = 2000
    private static readonly PRE_PROMPT_UPDATE_QUIET_PERIOD_MS = 200
    private static readonly PRE_PROMPT_UPDATE_DRAIN_TIMEOUT_MS = 1200

    constructor(private readonly options: { command: string; args?: string[]; env?: Record<string, string> }) {}

    async initialize(): Promise<void> {
        if (this.transport) return

        this.transport = new AcpStdioTransport({
            command: this.options.command,
            args: this.options.args,
            env: this.options.env,
        })

        this.transport.onNotification((method, params) => {
            if (method === 'session/update') {
                this.handleSessionUpdate(params)
            }
        })

        this.transport.onStderrError((error) => {
            this.stderrErrorHandler?.(error)
        })

        this.transport.registerRequestHandler('session/request_permission', async (params, requestId) => {
            return await this.handlePermissionRequest(params, requestId)
        })

        const response = await this.sendRetriedRequest('initialize', {
            protocolVersion: 1,
            clientCapabilities: {
                fs: { readTextFile: false, writeTextFile: false },
                terminal: false,
            },
            clientInfo: {
                name: 'viby',
                version: packageJson.version,
            },
        })

        if (!isObject(response) || typeof response.protocolVersion !== 'number') {
            throw new Error('Invalid initialize response from ACP agent')
        }

        logger.debug(`[ACP] Initialized with protocol version ${response.protocolVersion}`)
    }

    async newSession(config: AgentSessionConfig): Promise<string> {
        if (!this.transport) {
            throw new Error('ACP transport not initialized')
        }

        const response = await this.sendRetriedRequest('session/new', {
            cwd: config.cwd,
            mcpServers: config.mcpServers,
        })

        const sessionId = isObject(response) ? asString(response.sessionId) : null
        if (!sessionId) {
            throw new Error('Invalid session/new response from ACP agent')
        }

        this.activeSessionId = sessionId
        return sessionId
    }

    async loadSession(config: AgentSessionConfig & { sessionId: string }): Promise<string> {
        if (!this.transport) {
            throw new Error('ACP transport not initialized')
        }

        const response = await this.sendRetriedRequest('session/load', {
            sessionId: config.sessionId,
            cwd: config.cwd,
            mcpServers: config.mcpServers,
        })

        const loadedSessionId = isObject(response) ? asString(response.sessionId) : null
        const sessionId = loadedSessionId ?? config.sessionId
        this.activeSessionId = sessionId
        return sessionId
    }

    async setSessionModel(sessionId: string, modelId: string): Promise<void> {
        if (!this.transport) {
            throw new Error('ACP transport not initialized')
        }

        this.activeSessionId = sessionId
        await this.transport.sendRequest('session/set_model', {
            sessionId,
            modelId,
        })
    }

    async prompt(sessionId: string, content: PromptContent[], onUpdate: (msg: AgentMessage) => void): Promise<void> {
        if (!this.transport) {
            throw new Error('ACP transport not initialized')
        }

        this.activeSessionId = sessionId
        await this.waitForSessionUpdateQuiet(
            AcpSdkBackend.PRE_PROMPT_UPDATE_QUIET_PERIOD_MS,
            AcpSdkBackend.PRE_PROMPT_UPDATE_DRAIN_TIMEOUT_MS
        )
        this.messageHandler?.flushText()
        this.messageHandler = null
        await this.waitForSessionUpdateQuiet(
            AcpSdkBackend.PRE_PROMPT_UPDATE_QUIET_PERIOD_MS,
            AcpSdkBackend.PRE_PROMPT_UPDATE_DRAIN_TIMEOUT_MS
        )
        this.messageHandler = new AcpMessageHandler(onUpdate)
        this.sessionUpdateTracker.startResponse()
        let stopReason: string | null = null

        try {
            // No timeout for prompt requests - they can run for extended periods
            // during complex tasks, tool-heavy operations, or slow model responses
            const response = await this.transport.sendRequest(
                'session/prompt',
                {
                    sessionId,
                    prompt: content,
                },
                { timeoutMs: Infinity }
            )

            stopReason = isObject(response) ? asString(response.stopReason) : null
        } finally {
            await this.waitForSessionUpdateQuiet(
                AcpSdkBackend.UPDATE_QUIET_PERIOD_MS,
                AcpSdkBackend.UPDATE_DRAIN_TIMEOUT_MS,
                Date.now()
            )
            this.messageHandler?.flushText()
            try {
                if (stopReason) {
                    onUpdate({ type: 'turn_complete', stopReason })
                }
            } finally {
                this.sessionUpdateTracker.completeResponse()
            }
        }
    }

    async cancelPrompt(sessionId: string): Promise<void> {
        if (!this.transport) {
            return
        }

        this.transport.sendNotification('session/cancel', { sessionId })
    }

    async respondToPermission(
        _sessionId: string,
        request: PermissionRequest,
        response: PermissionResponse
    ): Promise<void> {
        const pending = this.pendingPermissions.get(request.id)
        if (!pending) {
            logger.debug('[ACP] No pending permission request for id', request.id)
            return
        }

        this.pendingPermissions.delete(request.id)

        if (response.outcome === 'cancelled') {
            pending.resolve({ outcome: { outcome: 'cancelled' } })
            return
        }

        pending.resolve({
            outcome: {
                outcome: 'selected',
                optionId: response.optionId,
            },
        })
    }

    onPermissionRequest(handler: (request: PermissionRequest) => void): void {
        this.permissionHandler = handler
    }

    onStderrError(handler: (error: AcpStderrError) => void): void {
        this.stderrErrorHandler = handler
    }

    /**
     * Returns true if currently processing a message (prompt in progress).
     * Useful for checking if it's safe to perform session operations.
     */
    get processingMessage(): boolean {
        return this.sessionUpdateTracker.processingMessage
    }

    getLastSessionUpdateAt(): number {
        return this.sessionUpdateTracker.getLastSessionUpdateAt()
    }

    /**
     * Wait for any in-progress response to complete.
     * Resolves immediately if no response is being processed.
     * Use this before performing operations that require the response to be complete,
     * like session swap or sending task_complete.
     */
    async waitForResponseComplete(): Promise<void> {
        await this.sessionUpdateTracker.waitForResponseComplete()
    }

    async disconnect(): Promise<void> {
        if (!this.transport) return
        this.messageHandler?.flushText()
        this.messageHandler = null
        this.activeSessionId = null
        this.sessionUpdateTracker.completeResponse()
        await this.transport.close()
        this.transport = null
    }

    private handleSessionUpdate(params: unknown): void {
        this.sessionUpdateTracker.handleSessionUpdate(params, this.activeSessionId, (update) => {
            this.messageHandler?.handleUpdate(update)
        })
    }

    private async waitForSessionUpdateQuiet(
        quietMs: number,
        timeoutMs: number,
        minimumQuietStartAt = 0
    ): Promise<void> {
        await this.sessionUpdateTracker.waitForQuiet(quietMs, timeoutMs, minimumQuietStartAt)
    }

    private async handlePermissionRequest(params: unknown, _requestId: string | number | null): Promise<unknown> {
        const request = buildAcpPermissionRequest(params, this.activeSessionId)
        if (!request) {
            return { outcome: { outcome: 'cancelled' } }
        }

        if (this.permissionHandler) {
            this.permissionHandler(request)
        } else {
            logger.debug('[ACP] No permission handler registered; cancelling request')
            return { outcome: { outcome: 'cancelled' } }
        }

        return await new Promise((resolve) => {
            this.pendingPermissions.set(request.toolCallId, { resolve })
        })
    }

    private async sendRetriedRequest(method: string, params: unknown): Promise<unknown> {
        return await withRetry(() => this.transport!.sendRequest(method, params), {
            ...AcpSdkBackend.INIT_RETRY_OPTIONS,
            onRetry: (error, attempt, nextDelayMs) => {
                logger.debug(`[ACP] ${method} attempt ${attempt} failed, retrying in ${nextDelayMs}ms`, error)
            },
        })
    }
}
