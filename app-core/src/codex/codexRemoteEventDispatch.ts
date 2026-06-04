import { randomUUID } from 'node:crypto'
import { PROPOSED_PLAN_CLOSE_TAG, PROPOSED_PLAN_OPEN_TAG } from '@viby/protocol'
import type { MessageBuffer } from '@/ui/ink/messageBuffer'
import { asRecord, asString, buildMcpToolName, formatOutputPreview } from './codexRemoteSupport'
import type { CodexSession } from './session'
import type { DiffProcessor } from './utils/diffProcessor'
import { parsePlanUpdatePayload } from './utils/planUpdateSupport'
import type { ReasoningProcessor } from './utils/reasoningProcessor'

const DEFAULT_PLAN_PRIORITY = 'medium'
const REASONING_PREVIEW_LENGTH = 100
const OUTPUT_PREVIEW_LENGTH = 200

type DispatchContext = {
    session: CodexSession
    messageBuffer: MessageBuffer
    reasoningProcessor: ReasoningProcessor
    diffProcessor: DiffProcessor
    appendAssistantStream: (assistantTurnId: string, delta: string) => void
    acknowledgeAssistantTurn: (assistantTurnId: string) => void
}

function buildStructuredPlanEntries(
    items: Array<{
        step: string
        status: 'pending' | 'in_progress' | 'completed'
    }>
): Array<{
    content: string
    status: 'pending' | 'in_progress' | 'completed'
    priority: 'medium'
}> {
    return items.map((item) => ({
        content: item.step,
        status: item.status,
        priority: DEFAULT_PLAN_PRIORITY,
    }))
}

function readAssistantTurnId(msg: Record<string, unknown>): string | undefined {
    return asString(msg.item_id ?? msg.itemId) ?? undefined
}

function readCallId(msg: Record<string, unknown>): string | undefined {
    return asString(msg.call_id ?? msg.callId) ?? undefined
}

function sendAssistantTranscriptMessage(options: {
    session: CodexSession
    acknowledgeAssistantTurn: DispatchContext['acknowledgeAssistantTurn']
    message: string
    assistantTurnId?: string
    proposedPlan?: boolean
}): void {
    const transcriptMessage = options.proposedPlan ? wrapProposedPlanMessage(options.message) : options.message
    options.session.sendCodexMessage({
        type: 'message',
        message: transcriptMessage,
        ...(options.assistantTurnId ? { itemId: options.assistantTurnId } : {}),
        id: randomUUID(),
    })
    if (options.assistantTurnId) {
        options.acknowledgeAssistantTurn(options.assistantTurnId)
    }
}

const BUFFER_EVENT_DISPATCH: Record<string, (context: DispatchContext, msg: Record<string, unknown>) => void> = {
    agent_message: ({ messageBuffer }, msg) => {
        const message = asString(msg.message)
        if (message) {
            messageBuffer.addMessage(message, 'assistant')
        }
    },
    agent_reasoning: ({ messageBuffer }, msg) => {
        const text = asString(msg.text)
        if (text) {
            messageBuffer.addMessage(`[Thinking] ${text.substring(0, REASONING_PREVIEW_LENGTH)}...`, 'system')
        }
    },
    exec_command_begin: ({ messageBuffer }, msg) => {
        const command = asString(msg.command) ?? 'command'
        messageBuffer.addMessage(`Executing: ${command}`, 'tool')
    },
    exec_command_end: ({ messageBuffer }, msg) => {
        const outputText = formatOutputPreview(msg.output ?? msg.error ?? 'Command completed')
        messageBuffer.addMessage(
            `Result: ${outputText.substring(0, OUTPUT_PREVIEW_LENGTH)}${outputText.length > OUTPUT_PREVIEW_LENGTH ? '...' : ''}`,
            'result'
        )
    },
    task_started: ({ messageBuffer }) => {
        messageBuffer.addMessage('Starting task...', 'status')
    },
    task_complete: ({ messageBuffer }) => {
        messageBuffer.addMessage('Task completed', 'status')
    },
    turn_aborted: ({ messageBuffer }) => {
        messageBuffer.addMessage('Turn aborted', 'status')
    },
    task_failed: ({ messageBuffer }, msg) => {
        const error = asString(msg.error)
        messageBuffer.addMessage(error ? `Task failed: ${error}` : 'Task failed', 'status')
    },
    patch_apply_begin: ({ messageBuffer }, msg) => {
        const changes = asRecord(msg.changes) ?? {}
        const changeCount = Object.keys(changes).length
        messageBuffer.addMessage(`Modifying ${changeCount === 1 ? '1 file' : `${changeCount} files`}...`, 'tool')
    },
    patch_apply_end: ({ messageBuffer }, msg) => {
        const stdout = asString(msg.stdout)
        const stderr = asString(msg.stderr)
        const success = Boolean(msg.success)
        if (success) {
            messageBuffer.addMessage(
                (stdout || 'Files modified successfully').substring(0, OUTPUT_PREVIEW_LENGTH),
                'result'
            )
            return
        }
        messageBuffer.addMessage(
            `Error: ${(stderr || 'Failed to modify files').substring(0, OUTPUT_PREVIEW_LENGTH)}`,
            'result'
        )
    },
    plan_update: ({ messageBuffer }) => {
        messageBuffer.addMessage('Plan updated', 'status')
    },
    plan_proposal: ({ messageBuffer }) => {
        messageBuffer.addMessage('Proposed plan ready', 'status')
    },
}

function wrapProposedPlanMessage(plan: string): string {
    return `${PROPOSED_PLAN_OPEN_TAG}\n${plan}\n${PROPOSED_PLAN_CLOSE_TAG}`
}

export function dispatchBufferEvent(context: DispatchContext, msgType: string, msg: Record<string, unknown>): void {
    BUFFER_EVENT_DISPATCH[msgType]?.(context, msg)
}

export function dispatchCodexStructuredEvent(
    context: DispatchContext,
    msgType: string,
    msg: Record<string, unknown>
): void {
    const { session, reasoningProcessor, diffProcessor, appendAssistantStream, acknowledgeAssistantTurn } = context

    if (msgType === 'agent_reasoning_section_break') {
        reasoningProcessor.handleSectionBreak()
        return
    }
    if (msgType === 'agent_message_delta') {
        const assistantTurnId = readAssistantTurnId(msg)
        const delta = asString(msg.delta)
        if (assistantTurnId && delta) {
            appendAssistantStream(assistantTurnId, delta)
        }
        return
    }
    if (msgType === 'agent_reasoning_delta') {
        const delta = asString(msg.delta)
        if (delta) {
            reasoningProcessor.processDelta(delta)
        }
        return
    }
    if (msgType === 'agent_reasoning') {
        const text = asString(msg.text)
        if (text) {
            reasoningProcessor.complete(text)
        }
        return
    }
    if (msgType === 'agent_message') {
        const message = asString(msg.message)
        const assistantTurnId = readAssistantTurnId(msg)
        if (message) {
            sendAssistantTranscriptMessage({ session, acknowledgeAssistantTurn, message, assistantTurnId })
        }
        return
    }
    if (msgType === 'plan_proposal') {
        const message = asString(msg.message)
        const assistantTurnId = readAssistantTurnId(msg)
        if (message) {
            sendAssistantTranscriptMessage({
                session,
                acknowledgeAssistantTurn,
                message,
                assistantTurnId,
                proposedPlan: true,
            })
        }
        return
    }
    if (msgType === 'exec_command_begin' || msgType === 'exec_approval_request') {
        const callId = readCallId(msg)
        if (callId) {
            const input: Record<string, unknown> = { ...msg }
            delete input.type
            delete input.call_id
            delete input.callId
            session.sendCodexMessage({
                type: 'tool-call',
                name: 'CodexBash',
                callId,
                input,
                id: randomUUID(),
            })
        }
        return
    }
    if (msgType === 'exec_command_end') {
        const callId = readCallId(msg)
        if (callId) {
            const output: Record<string, unknown> = { ...msg }
            delete output.type
            delete output.call_id
            delete output.callId
            session.sendCodexMessage({
                type: 'tool-call-result',
                callId,
                output,
                id: randomUUID(),
            })
        }
        return
    }
    if (msgType === 'token_count') {
        session.sendCodexMessage({ ...msg, id: randomUUID() })
        return
    }
    if (msgType === 'patch_apply_begin') {
        const callId = readCallId(msg)
        if (callId) {
            session.sendCodexMessage({
                type: 'tool-call',
                name: 'CodexPatch',
                callId,
                input: {
                    auto_approved: msg.auto_approved ?? msg.autoApproved,
                    changes: asRecord(msg.changes) ?? {},
                },
                id: randomUUID(),
            })
        }
        return
    }
    if (msgType === 'patch_apply_end') {
        const callId = readCallId(msg)
        if (callId) {
            session.sendCodexMessage({
                type: 'tool-call-result',
                callId,
                output: {
                    stdout: asString(msg.stdout),
                    stderr: asString(msg.stderr),
                    success: Boolean(msg.success),
                },
                id: randomUUID(),
            })
        }
        return
    }
    if (msgType === 'mcp_tool_call_begin') {
        const callId = readCallId(msg)
        const invocation = asRecord(msg.invocation) ?? {}
        const name = buildMcpToolName(
            invocation.server ?? invocation.server_name ?? msg.server,
            invocation.tool ?? invocation.tool_name ?? msg.tool
        )
        if (callId && name) {
            session.sendCodexMessage({
                type: 'tool-call',
                name,
                callId,
                input: invocation.arguments ?? invocation.input ?? msg.arguments ?? msg.input ?? {},
                id: randomUUID(),
            })
        }
        return
    }
    if (msgType === 'mcp_tool_call_end') {
        const callId = readCallId(msg)
        const resultRecord = asRecord(msg.result)
        let output = msg.result
        let isError = false
        if (resultRecord) {
            if (Object.prototype.hasOwnProperty.call(resultRecord, 'Ok')) {
                output = resultRecord.Ok
            } else if (Object.prototype.hasOwnProperty.call(resultRecord, 'Err')) {
                output = resultRecord.Err
                isError = true
            }
        }
        if (callId) {
            session.sendCodexMessage({
                type: 'tool-call-result',
                callId,
                output,
                is_error: isError,
                id: randomUUID(),
            })
        }
        return
    }
    if (msgType === 'plan_update') {
        const payload = parsePlanUpdatePayload(msg)
        if (!payload) {
            return
        }
        session.sendCodexMessage({
            type: 'plan',
            id: payload.callId,
            entries: buildStructuredPlanEntries(payload.plan),
            ...(payload.explanation ? { explanation: payload.explanation } : {}),
        })
        return
    }
    if (msgType === 'turn_diff') {
        const diff = asString(msg.unified_diff)
        if (diff) {
            diffProcessor.processDiff(diff)
        }
    }
}
