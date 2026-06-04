import { SESSION_RECOVERY_PAGE_SIZE } from '@viby/protocol'
import { type AxiosRequestConfig } from 'axios'
import { configuration } from '@/configuration'
import {
    applyRecoveredSessionSnapshot,
    backfillSessionStateIfNeeded,
    fetchSessionRecoveryPage,
    handleIncomingSessionMessage,
    type RecoveryState,
    recoverSessionState,
} from './runtimeSessionRecovery'
import type { RuntimeSessionRecoveryResponse, UserMessage } from './types'

type RuntimeSessionRecoveryOwnerOptions = {
    token: string
    sessionId: string
    getRecoveryState: () => RecoveryState
    enqueueUserMessage: (message: UserMessage, localId?: string) => void
    emitMessage: (content: unknown) => void
    observeAutoSummary?: (summary: { text: string; updatedAt: number | null }) => void
}

export class RuntimeSessionRecoveryOwner {
    private readonly token: string
    private readonly sessionId: string
    private readonly getRecoveryState: () => RecoveryState
    private readonly enqueueUserMessage: (message: UserMessage, localId?: string) => void
    private readonly emitMessage: (content: unknown) => void
    private readonly observeAutoSummary?: (summary: { text: string; updatedAt: number | null }) => void

    constructor(options: RuntimeSessionRecoveryOwnerOptions) {
        this.token = options.token
        this.sessionId = options.sessionId
        this.getRecoveryState = options.getRecoveryState
        this.enqueueUserMessage = options.enqueueUserMessage
        this.emitMessage = options.emitMessage
        this.observeAutoSummary = options.observeAutoSummary
    }

    handleIncomingMessage(message: { seq?: number | null; localId?: string | null; content: unknown }): void {
        handleIncomingSessionMessage(
            this.getRecoveryState(),
            message,
            this.enqueueUserMessage,
            this.emitMessage,
            this.observeAutoSummary
        )
    }

    applyRecoveredSessionSnapshot(session: RuntimeSessionRecoveryResponse['session']): void {
        applyRecoveredSessionSnapshot(this.getRecoveryState(), session)
    }

    async recoverSessionState(): Promise<void> {
        await recoverSessionState({
            state: this.getRecoveryState(),
            fetchPage: async (afterSeq) =>
                await fetchSessionRecoveryPage(
                    this.sessionId,
                    afterSeq,
                    this.createAuthorizedJsonRequestConfig({
                        afterSeq,
                        limit: SESSION_RECOVERY_PAGE_SIZE,
                    }),
                    configuration.apiUrl
                ),
            handleIncomingMessage: (message) => {
                this.handleIncomingMessage(message)
            },
        })
    }

    async backfillIfNeeded(): Promise<void> {
        await backfillSessionStateIfNeeded(this.getRecoveryState(), async () => {
            await this.recoverSessionState()
        })
    }

    private createAuthorizedJsonRequestConfig(params?: Record<string, number>): AxiosRequestConfig {
        return {
            headers: {
                Authorization: `Bearer ${this.token}`,
                'Content-Type': 'application/json',
            },
            params,
        }
    }
}
