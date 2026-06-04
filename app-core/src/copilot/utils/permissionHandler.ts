import { randomUUID } from 'node:crypto'
import type { PermissionHandler, PermissionRequest, PermissionRequestResult } from '@github/copilot-sdk'
import { approveAll } from '@github/copilot-sdk'
import { isAllowedBashCommand, parseBashPermission } from '@/modules/common/permission/allowedToolSupport'
import {
    BasePermissionHandler,
    type PendingPermissionRequest,
    type PermissionCompletion,
} from '@/modules/common/permission/BasePermissionHandler'
import { logger } from '@/ui/logger'
import type { CopilotSession } from '../session'
import type { PermissionMode } from '../types'

interface PermissionResponseRpc {
    id: string
    approved: boolean
    mode?: PermissionMode
    allowTools?: string[]
    decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort'
    reason?: string
}

const SAFE_KINDS: ReadonlySet<PermissionRequest['kind']> = new Set(['read', 'url'])
const EDIT_KINDS: ReadonlySet<PermissionRequest['kind']> = new Set(['write'])

type NormalizedPermissionRequest = {
    id: string
    toolName: string
    input: unknown
}

type AutoApprovalResult = PermissionRequestResult | ReturnType<typeof approveAll>

type AutoApproval = {
    result: AutoApprovalResult
    decision: 'approved' | 'approved_for_session'
    mode?: PermissionMode
}

function readOptionalString(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null
    }
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

function normalizePermissionRequest(request: PermissionRequest): NormalizedPermissionRequest {
    const id = readOptionalString(request.toolCallId) ?? randomUUID()

    switch (request.kind) {
        case 'shell': {
            const command = readOptionalString(request.fullCommandText)
            return {
                id,
                toolName: 'Bash',
                input: command ? { command } : request,
            }
        }
        case 'write': {
            const filePath = readOptionalString(request.fileName)
            return {
                id,
                toolName: 'Write',
                input: filePath ? { filePath } : request,
            }
        }
        case 'read': {
            const filePath = readOptionalString(request.fileName)
            return {
                id,
                toolName: 'Read',
                input: filePath ? { filePath } : request,
            }
        }
        case 'url': {
            const url = readOptionalString(request.url) ?? readOptionalString(request.uri)
            return {
                id,
                toolName: 'WebFetch',
                input: url ? { url } : request,
            }
        }
        case 'mcp':
        case 'custom-tool':
            return {
                id,
                toolName: readOptionalString(request.toolName) ?? 'Tool',
                input: request.arguments ?? request,
            }
        default:
            return {
                id,
                toolName: request.kind,
                input: request,
            }
    }
}

export class CopilotPermissionHandler extends BasePermissionHandler<PermissionResponseRpc, PermissionRequestResult> {
    private readonly allowedTools = new Set<string>()
    private readonly allowedBashLiterals = new Set<string>()
    private readonly allowedBashPrefixes = new Set<string>()

    constructor(private readonly session: CopilotSession) {
        super(session.client)
    }

    buildHandler(): PermissionHandler {
        return (request, invocation) => {
            const normalized = normalizePermissionRequest(request)
            const autoApproval = this.resolveAutoApproval(request, normalized, invocation.sessionId)
            if (autoApproval) {
                return this.completeAutoApproval(normalized, autoApproval)
            }

            return new Promise((resolve, reject) => {
                this.addPendingRequest(normalized.id, normalized.toolName, normalized.input, { resolve, reject })
                logger.debug(`[copilot-perm] Queued ${normalized.toolName} (${normalized.id}) for UI approval`)
            })
        }
    }

    async cancelAll(reason: string): Promise<void> {
        this.cancelPendingRequests({
            completedReason: reason,
            rejectMessage: reason,
            decision: 'abort',
        })
    }

    protected async handlePermissionResponse(
        response: PermissionResponseRpc,
        pending: PendingPermissionRequest<PermissionRequestResult>
    ): Promise<PermissionCompletion> {
        if (response.mode) {
            this.session.setPermissionMode(response.mode)
        }
        this.applyAllowTools(response.allowTools)

        const decision = response.decision ?? (response.approved ? 'approved' : 'denied')
        const result: PermissionRequestResult =
            decision === 'approved' || decision === 'approved_for_session'
                ? { kind: 'approved' }
                : { kind: 'denied-interactively-by-user', feedback: response.reason }

        pending.resolve(result)

        logger.debug(`[copilot-perm] Resolved ${response.id}: ${response.approved ? 'approved' : 'denied'}`)
        return {
            status: decision === 'abort' ? 'canceled' : response.approved ? 'approved' : 'denied',
            decision,
            reason: response.reason,
            mode: response.mode,
            allowTools: response.allowTools,
        }
    }

    protected handleMissingPendingResponse(response: PermissionResponseRpc): void {
        logger.debug('[copilot-perm] Response for unknown request', response.id)
    }

    private resolveAutoApproval(
        request: PermissionRequest,
        normalized: NormalizedPermissionRequest,
        sdkSessionId: string
    ): AutoApproval | null {
        if (
            normalized.toolName === 'Bash' &&
            isAllowedBashCommand({
                input: normalized.input,
                allowedBashLiterals: this.allowedBashLiterals,
                allowedBashPrefixes: this.allowedBashPrefixes,
            })
        ) {
            return {
                result: { kind: 'approved' },
                decision: 'approved_for_session',
            }
        }

        if (normalized.toolName !== 'Bash' && this.allowedTools.has(normalized.toolName)) {
            return {
                result: { kind: 'approved' },
                decision: 'approved_for_session',
            }
        }

        const mode = this.session.currentPermissionMode
        if (mode === 'bypassPermissions') {
            return {
                result: approveAll(request, { sessionId: sdkSessionId }),
                decision: 'approved',
                mode,
            }
        }

        if (SAFE_KINDS.has(request.kind)) {
            return {
                result: { kind: 'approved' },
                decision: 'approved',
            }
        }

        if (mode === 'acceptEdits' && EDIT_KINDS.has(request.kind)) {
            return {
                result: { kind: 'approved' },
                decision: 'approved',
                mode,
            }
        }

        return null
    }

    private completeAutoApproval(normalized: NormalizedPermissionRequest, approval: AutoApproval): AutoApprovalResult {
        const now = Date.now()
        this.client.updateAgentState((state) => ({
            ...state,
            completedRequests: {
                ...state.completedRequests,
                [normalized.id]: {
                    tool: normalized.toolName,
                    arguments: normalized.input,
                    createdAt: now,
                    completedAt: now,
                    status: 'approved',
                    decision: approval.decision,
                    mode: approval.mode,
                },
            },
        }))
        return approval.result
    }

    private applyAllowTools(allowTools: readonly string[] | undefined): void {
        if (!allowTools || allowTools.length === 0) {
            return
        }

        for (const permission of allowTools) {
            if (permission.startsWith('Bash(') || permission === 'Bash') {
                parseBashPermission({
                    permission,
                    allowedBashLiterals: this.allowedBashLiterals,
                    allowedBashPrefixes: this.allowedBashPrefixes,
                })
                continue
            }
            this.allowedTools.add(permission)
        }
    }
}
