import { logger } from '@/lib'
import {
    BasePermissionHandler,
    type PendingPermissionRequest,
    type PermissionCompletion,
} from '@/modules/common/permission/BasePermissionHandler'
import { delay } from '@/utils/time'
import { EnhancedMode, PermissionMode } from '../loop'
import { SDKMessage } from '../sdk'
import { PLAN_FAKE_REJECT, PLAN_FAKE_RESTART } from '../sdk/prompts'
import { PermissionResult } from '../sdk/types'
import { Session } from '../session'
import { getToolDescriptor } from './getToolDescriptor'
import {
    buildAskUserQuestionUpdatedInput,
    buildRequestUserInputUpdatedInput,
    isAllowedBashCommand,
    isAskUserQuestionToolName,
    isQuestionToolName,
    isRequestUserInputToolName,
    isToolCallAborted,
    type PermissionResponse,
    PLAN_EXIT_MODES,
    parseBashPermission,
    resolveToolCallId,
    type ToolCallRecord,
    trackToolCalls,
} from './permissionHandlerSupport'

export class PermissionHandler extends BasePermissionHandler<PermissionResponse, PermissionResult> {
    private toolCalls: ToolCallRecord[] = []
    private responses = new Map<string, PermissionResponse>()
    private session: Session
    private allowedTools = new Set<string>()
    private allowedBashLiterals = new Set<string>()
    private allowedBashPrefixes = new Set<string>()
    private permissionMode: PermissionMode = 'default'
    private onPermissionRequestCallback?: (toolCallId: string) => void

    constructor(session: Session) {
        super(session.client)
        this.session = session
    }

    setOnPermissionRequest(callback: (toolCallId: string) => void) {
        this.onPermissionRequestCallback = callback
    }

    handleModeChange(mode: PermissionMode) {
        this.permissionMode = mode
        this.session.setPermissionMode(mode)
    }

    protected async handlePermissionResponse(
        response: PermissionResponse,
        pending: PendingPermissionRequest<PermissionResult>
    ): Promise<PermissionCompletion> {
        const completion: PermissionCompletion = {
            status: response.approved ? 'approved' : 'denied',
            reason: response.reason,
            mode: response.mode,
            allowTools: response.allowTools,
            answers: response.answers,
        }

        if (response.allowTools && response.allowTools.length > 0) {
            response.allowTools.forEach((tool) => {
                if (isQuestionToolName(tool)) {
                    return
                }
                if (tool.startsWith('Bash(') || tool === 'Bash') {
                    parseBashPermission({
                        permission: tool,
                        allowedBashLiterals: this.allowedBashLiterals,
                        allowedBashPrefixes: this.allowedBashPrefixes,
                    })
                } else {
                    this.allowedTools.add(tool)
                }
            })
        }

        if (response.mode) {
            this.permissionMode = response.mode
            this.session.setPermissionMode(response.mode)
        }

        if (isAskUserQuestionToolName(pending.toolName)) {
            const answers = response.answers ?? {}
            if (Object.keys(answers).length === 0) {
                pending.resolve({ behavior: 'deny', message: 'No answers were provided.' })
                completion.status = 'denied'
                completion.reason = completion.reason ?? 'No answers were provided.'
            } else {
                pending.resolve({
                    behavior: 'allow',
                    updatedInput: buildAskUserQuestionUpdatedInput(pending.input, answers),
                })
            }
            return completion
        }

        if (isRequestUserInputToolName(pending.toolName)) {
            const answers = response.answers ?? {}
            if (Object.keys(answers).length === 0) {
                pending.resolve({ behavior: 'deny', message: 'No answers were provided.' })
                completion.status = 'denied'
                completion.reason = completion.reason ?? 'No answers were provided.'
            } else {
                pending.resolve({
                    behavior: 'allow',
                    updatedInput: buildRequestUserInputUpdatedInput(pending.input, answers),
                })
            }
            return completion
        }

        if (pending.toolName === 'exit_plan_mode' || pending.toolName === 'ExitPlanMode') {
            logger.debug('Plan mode result received', response)
            if (response.approved) {
                logger.debug('Plan approved - injecting PLAN_FAKE_RESTART')
                if (response.mode && PLAN_EXIT_MODES.includes(response.mode)) {
                    this.session.queue.unshift(PLAN_FAKE_RESTART, { permissionMode: response.mode })
                } else {
                    this.session.queue.unshift(PLAN_FAKE_RESTART, { permissionMode: 'default' })
                }
                pending.resolve({ behavior: 'deny', message: PLAN_FAKE_REJECT })
            } else {
                pending.resolve({ behavior: 'deny', message: response.reason || 'Plan rejected' })
            }
            return completion
        }

        const result: PermissionResult = response.approved
            ? { behavior: 'allow', updatedInput: (pending.input as Record<string, unknown>) || {} }
            : {
                  behavior: 'deny',
                  message:
                      response.reason ||
                      `The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). STOP what you are doing and wait for the user to tell you how to proceed.`,
              }

        pending.resolve(result)
        return completion
    }

    handleToolCall = async (
        toolName: string,
        input: unknown,
        mode: EnhancedMode,
        options: { signal: AbortSignal }
    ): Promise<PermissionResult> => {
        const isQuestionTool = isQuestionToolName(toolName)

        if (!isQuestionTool && toolName === 'Bash') {
            if (
                isAllowedBashCommand({
                    input,
                    allowedBashLiterals: this.allowedBashLiterals,
                    allowedBashPrefixes: this.allowedBashPrefixes,
                })
            ) {
                return { behavior: 'allow', updatedInput: input as Record<string, unknown> }
            }
        } else if (!isQuestionTool && this.allowedTools.has(toolName)) {
            return { behavior: 'allow', updatedInput: input as Record<string, unknown> }
        }

        const descriptor = getToolDescriptor(toolName)

        if (!isQuestionTool && this.permissionMode === 'bypassPermissions') {
            return { behavior: 'allow', updatedInput: input as Record<string, unknown> }
        }

        if (!isQuestionTool && this.permissionMode === 'acceptEdits' && descriptor.edit) {
            return { behavior: 'allow', updatedInput: input as Record<string, unknown> }
        }

        let toolCallId = resolveToolCallId(this.toolCalls, toolName, input)
        if (!toolCallId) {
            await delay(1000)
            toolCallId = resolveToolCallId(this.toolCalls, toolName, input)
            if (!toolCallId) {
                throw new Error(`Could not resolve tool call ID for ${toolName}`)
            }
        }
        return this.handlePermissionRequest(toolCallId, toolName, input, options.signal)
    }

    private async handlePermissionRequest(
        id: string,
        toolName: string,
        input: unknown,
        signal: AbortSignal
    ): Promise<PermissionResult> {
        return new Promise<PermissionResult>((resolve, reject) => {
            const abortHandler = () => {
                this.pendingRequests.delete(id)
                reject(new Error('Permission request aborted'))
            }
            signal.addEventListener('abort', abortHandler, { once: true })

            this.addPendingRequest(id, toolName, input, {
                resolve: (result: PermissionResult) => {
                    signal.removeEventListener('abort', abortHandler)
                    resolve(result)
                },
                reject: (error: Error) => {
                    signal.removeEventListener('abort', abortHandler)
                    reject(error)
                },
            })

            logger.debug(`Permission request sent for tool call ${id}: ${toolName}`)
        })
    }

    onMessage(message: SDKMessage): void {
        trackToolCalls(this.toolCalls, message)
    }

    isAborted(toolCallId: string): boolean {
        return isToolCallAborted(this.toolCalls, this.responses, toolCallId)
    }

    reset(): void {
        this.toolCalls = []
        this.responses.clear()
        this.allowedTools.clear()
        this.allowedBashLiterals.clear()
        this.allowedBashPrefixes.clear()

        this.cancelPendingRequests({
            completedReason: 'Session reset',
            rejectMessage: 'Session reset',
        })
    }

    getResponses(): Map<string, PermissionResponse> {
        return this.responses
    }

    protected handleMissingPendingResponse(_response: PermissionResponse): void {
        logger.debug('Permission request not found or already resolved')
    }

    protected onResponseReceived(response: PermissionResponse): void {
        logger.debug(`Permission response: ${JSON.stringify(response)}`)
        this.responses.set(response.id, { ...response, receivedAt: Date.now() })
    }

    protected onRequestRegistered(toolCallId: string): void {
        if (this.onPermissionRequestCallback) {
            this.onPermissionRequestCallback(toolCallId)
        }
    }
}
