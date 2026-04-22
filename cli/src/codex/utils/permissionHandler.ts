import type { CodexPermissionMode } from '@viby/protocol/types'
import { ApiSessionClient } from '@/api/apiSession'
import {
    type AutoApprovalDecision,
    BasePermissionHandler,
    type PendingPermissionRequest,
    type PermissionCompletion,
} from '@/modules/common/permission/BasePermissionHandler'
import { logger } from '@/ui/logger'

type UserInputAnswers = Record<string, string[]> | Record<string, { answers: string[] }>

interface PermissionResponse {
    id: string
    approved: boolean
    decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort'
    reason?: string
    answers?: UserInputAnswers
}

interface PermissionResult {
    decision: 'approved' | 'approved_for_session' | 'denied' | 'abort'
    reason?: string
}

type CodexPermissionHandlerOptions = {
    onRequest?: (request: { id: string; toolName: string; input: unknown }) => void
    onComplete?: (result: {
        id: string
        toolName: string
        input: unknown
        approved: boolean
        decision: PermissionResult['decision']
        reason?: string
        answers?: UserInputAnswers
    }) => void
}

export class CodexPermissionHandler extends BasePermissionHandler<
    PermissionResponse,
    PermissionResult | UserInputAnswers
> {
    constructor(
        session: ApiSessionClient,
        private readonly getPermissionMode: () => CodexPermissionMode | undefined,
        private readonly options?: CodexPermissionHandlerOptions
    ) {
        super(session)
    }

    protected override onRequestRegistered(id: string, toolName: string, input: unknown): void {
        this.options?.onRequest?.({ id, toolName, input })
    }

    private completeAutoApproval(
        id: string,
        toolName: string,
        input: unknown,
        decision: AutoApprovalDecision
    ): PermissionResult {
        const timestamp = Date.now()

        this.options?.onRequest?.({ id, toolName, input })
        this.options?.onComplete?.({
            id,
            toolName,
            input,
            approved: true,
            decision,
        })

        this.client.updateAgentState((currentState) => ({
            ...currentState,
            completedRequests: {
                ...currentState.completedRequests,
                [id]: {
                    tool: toolName,
                    arguments: input,
                    createdAt: timestamp,
                    completedAt: timestamp,
                    status: 'approved',
                    decision,
                },
            },
        }))

        logger.debug(`[Codex] Auto-approved ${toolName} (${id}) with decision=${decision}`)

        return { decision }
    }

    private emitCompletion(args: {
        id: string
        pending: PendingPermissionRequest<PermissionResult | UserInputAnswers>
        approved: boolean
        result: PermissionResult
        answers?: UserInputAnswers
    }): void {
        this.options?.onComplete?.({
            id: args.id,
            toolName: args.pending.toolName,
            input: args.pending.input,
            approved: args.approved,
            decision: args.result.decision,
            reason: args.result.reason,
            answers: args.answers,
        })
    }

    private createPermissionResult(response: PermissionResponse): PermissionResult {
        const reason = typeof response.reason === 'string' ? response.reason : undefined
        if (response.approved) {
            return {
                decision: response.decision === 'approved_for_session' ? 'approved_for_session' : 'approved',
                reason,
            }
        }

        return {
            decision: response.decision === 'denied' ? 'denied' : 'abort',
            reason,
        }
    }

    async handleUserInputRequest(requestId: string, input: unknown): Promise<UserInputAnswers> {
        return await new Promise<UserInputAnswers>((resolve, reject) => {
            this.addPendingRequest(requestId, 'request_user_input', input, {
                resolve: resolve as (value: PermissionResult | UserInputAnswers) => void,
                reject,
            })
            logger.debug(`[Codex] User-input request sent (${requestId})`)
        })
    }

    async handleToolCall(toolCallId: string, toolName: string, input: unknown): Promise<PermissionResult> {
        const mode = this.getPermissionMode() ?? 'default'
        const autoDecision = this.resolveAutoApprovalDecision(mode, toolName, toolCallId)
        if (autoDecision) {
            return this.completeAutoApproval(toolCallId, toolName, input, autoDecision)
        }

        return new Promise<PermissionResult>((resolve, reject) => {
            this.addPendingRequest(toolCallId, toolName, input, {
                resolve: resolve as (value: PermissionResult | UserInputAnswers) => void,
                reject,
            })

            logger.debug(`[Codex] Permission request sent for tool: ${toolName} (${toolCallId})`)
        })
    }

    protected async handlePermissionResponse(
        response: PermissionResponse,
        pending: PendingPermissionRequest<PermissionResult | UserInputAnswers>
    ): Promise<PermissionCompletion> {
        const result = this.createPermissionResult(response)

        if (pending.toolName === 'request_user_input') {
            const answers = response.answers ?? {}
            pending.resolve(answers)
            logger.debug(`[Codex] User-input ${response.approved ? 'accepted' : 'denied'} for ${response.id}`)
            this.emitCompletion({ id: response.id, pending, approved: response.approved, result, answers })

            return {
                status: response.approved ? 'approved' : 'denied',
                decision: result.decision,
                reason: result.reason,
                answers,
            }
        }

        pending.resolve(result)
        logger.debug(`[Codex] Permission ${response.approved ? 'approved' : 'denied'} for ${pending.toolName}`)
        this.emitCompletion({ id: response.id, pending, approved: response.approved, result })

        return {
            status: response.approved ? 'approved' : 'denied',
            decision: result.decision,
            reason: result.reason,
        }
    }

    protected handleMissingPendingResponse(_response: PermissionResponse): void {
        logger.debug('[Codex] Permission request not found or already resolved')
    }

    reset(): void {
        this.cancelPendingRequests({
            completedReason: 'Session reset',
            rejectMessage: 'Session reset',
        })

        logger.debug('[Codex] Permission handler reset')
    }
}
