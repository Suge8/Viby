import { randomUUID } from 'node:crypto'
import { asRecord, normalizeCommand } from './codexRemoteSupport'

type UserInputAnswers = Record<string, string[]> | Record<string, { answers: string[] }>

export function buildCodexPermissionBridgeHandlers(session: { sendCodexMessage: (message: unknown) => void }) {
    return {
        onRequest: ({ id, toolName, input }: { id: string; toolName: string; input: unknown }) => {
            if (toolName === 'request_user_input') {
                session.sendCodexMessage({
                    type: 'tool-call',
                    name: toolName,
                    callId: id,
                    input,
                    id: randomUUID(),
                })
                return
            }

            const inputRecord = asRecord(input) ?? {}
            const message = typeof inputRecord.message === 'string' ? inputRecord.message : undefined
            const command = normalizeCommand(inputRecord.command)
            const cwdValue = inputRecord.cwd
            const cwd = typeof cwdValue === 'string' && cwdValue.trim().length > 0 ? cwdValue : undefined

            session.sendCodexMessage({
                type: 'tool-call',
                name: 'CodexPermission',
                callId: id,
                input: { tool: toolName, message, command, cwd },
                id: randomUUID(),
            })
        },
        onComplete: ({
            id,
            decision,
            reason,
            approved,
            toolName,
            answers,
        }: {
            id: string
            decision: unknown
            reason?: unknown
            approved: boolean
            toolName: string
            answers?: UserInputAnswers
        }) => {
            session.sendCodexMessage({
                type: 'tool-call-result',
                callId: id,
                output: toolName === 'request_user_input' && answers ? { answers } : { decision, reason },
                is_error: !approved,
                id: randomUUID(),
            })
        },
    }
}
