import { logger } from '@/ui/logger'
import type { PiPermissionMode } from '@/api/types'
import type { ApiSessionClient } from '@/api/apiSession'
import {
    BasePermissionHandler,
    type AutoApprovalDecision,
    type PendingPermissionRequest,
    type PermissionCompletion
} from '@/modules/common/permission/BasePermissionHandler'
import type { ToolCallEventResult } from '@mariozechner/pi-coding-agent'

type PermissionResponse = {
    id: string
    approved: boolean
    decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort'
    reason?: string
}

export class PiPermissionHandler extends BasePermissionHandler<PermissionResponse, ToolCallEventResult> {
    constructor(
        session: ApiSessionClient,
        private readonly getPermissionMode: () => PiPermissionMode | undefined,
        private readonly onAbort: () => Promise<void>
    ) {
        super(session)
    }

    async handleToolCall(toolCallId: string, toolName: string, input: unknown): Promise<ToolCallEventResult> {
        const mode = this.getPermissionMode() ?? 'default'
        const autoDecision = this.resolveAutoApprovalDecision(mode, toolName, toolCallId)
        if (autoDecision) {
            return this.completeAutoApproval(toolCallId, toolName, input, autoDecision)
        }

        return await new Promise<ToolCallEventResult>((resolve, reject) => {
            this.addPendingRequest(toolCallId, toolName, input, { resolve, reject })
            logger.debug(`[Pi] Permission request sent for tool: ${toolName} (${toolCallId})`)
        })
    }

    hasPendingRequests(): boolean {
        return this.pendingRequests.size > 0
    }

    async cancelAll(reason: string): Promise<void> {
        this.cancelPendingRequests({
            completedReason: reason,
            rejectMessage: reason,
            decision: 'abort'
        })
    }

    protected async handlePermissionResponse(
        response: PermissionResponse,
        pending: PendingPermissionRequest<ToolCallEventResult>
    ): Promise<PermissionCompletion> {
        const reason = typeof response.reason === 'string' ? response.reason : undefined
        const decision = response.approved
            ? response.decision === 'approved_for_session'
                ? 'approved_for_session'
                : 'approved'
            : response.decision === 'denied'
                ? 'denied'
                : 'abort'

        if (decision === 'abort') {
            await this.onAbort()
            await this.cancelAll('User aborted')
        }

        pending.resolve(decision === 'approved' || decision === 'approved_for_session'
            ? {}
            : {
                block: true,
                reason: reason ?? 'Tool execution blocked by Viby approval flow'
            })

        logger.debug(`[Pi] Permission ${response.approved ? 'approved' : 'denied'} for ${pending.toolName}`)

        return {
            status: response.approved ? 'approved' : 'denied',
            decision,
            reason
        }
    }

    protected handleMissingPendingResponse(_response: PermissionResponse): void {
        logger.debug('[Pi] Permission request not found or already resolved')
    }

    private completeAutoApproval(
        id: string,
        toolName: string,
        input: unknown,
        decision: AutoApprovalDecision
    ): ToolCallEventResult {
        const timestamp = Date.now()

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
                    decision
                }
            }
        }))

        logger.debug(`[Pi] Auto-approved ${toolName} (${id}) with decision=${decision}`)
        return {}
    }
}
