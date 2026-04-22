import { isPermissionModeAllowedForDriver } from '@viby/protocol'
import { ClaudeReasoningEffortSchema } from '@viby/protocol/schemas'
import { mergePromptSegments } from '@/agent/promptInstructions'
import { assertSessionConfigPayload, resolvePermissionModeForDriver } from '@/agent/providerConfig'
import type { ClaudeSessionModelReasoningEffort, SessionModel, UserMessage } from '@/api/types'
import type { ApiSessionClient } from '@/lib'
import { parseSpecialCommand } from '@/parsers/specialCommands'
import { logger } from '@/ui/logger'
import { formatMessageWithAttachments } from '@/utils/attachmentFormatter'
import type { MessageQueue2 } from '@/utils/MessageQueue2'
import type { EnhancedMode, PermissionMode } from './loop'
import { normalizeClaudeSessionModel } from './model'
import type { Session } from './session'

type StickyStringMessageMetaKey = 'customSystemPrompt' | 'fallbackModel' | 'appendSystemPrompt'
type StickyListMessageMetaKey = 'allowedTools' | 'disallowedTools'

export type ClaudeRuntimeSelections = {
    permissionMode: PermissionMode
    model: SessionModel
    modelReasoningEffort: ClaudeSessionModelReasoningEffort
    fallbackModel?: string
    customSystemPrompt?: string
    appendSystemPromptOverride?: string
    allowedTools?: string[]
    disallowedTools?: string[]
}

type PendingSessionContinuityHandoffState = {
    consumeForUserMessage: (message: string) => string | undefined
}

function hasMessageMetaOverride(meta: Record<string, unknown> | null | undefined, key: string): boolean {
    return Boolean(meta) && Object.prototype.hasOwnProperty.call(meta, key)
}

function readOptionalString(value: unknown): string | undefined {
    return (value as string | null | undefined) || undefined
}

function readOptionalStringList(value: unknown): string[] | undefined {
    return (value as string[] | null | undefined) || undefined
}

function formatOverridePresence(value: unknown, emptyLabel: string): string {
    return value ? 'set' : emptyLabel
}

function formatOptionalStringValue(value: string | undefined, emptyLabel: string): string {
    return value || emptyLabel
}

function formatOptionalStringListValue(value: string[] | undefined, emptyLabel: string): string {
    return value ? value.join(', ') : emptyLabel
}

function resolveStickyOverride<TValue>(options: {
    meta: Record<string, unknown> | null | undefined
    key: StickyStringMessageMetaKey | StickyListMessageMetaKey
    currentValue: TValue | undefined
    updatedLabel: string
    missingLabel: string
    read: (value: unknown) => TValue | undefined
    formatUpdatedValue: (value: TValue | undefined) => string
    formatCurrentValue: (value: TValue | undefined) => string
}): TValue | undefined {
    if (hasMessageMetaOverride(options.meta, options.key)) {
        const nextValue = options.read(options.meta?.[options.key])
        logger.debug(
            `[loop] ${options.updatedLabel} updated from user message: ${options.formatUpdatedValue(nextValue)}`
        )
        return nextValue
    }
    logger.debug(
        `[loop] User message received with no ${options.missingLabel} override, using current: ${options.formatCurrentValue(options.currentValue)}`
    )
    return options.currentValue
}

export function syncClaudeSessionModes(session: Session | null, selections: ClaudeRuntimeSelections): void {
    if (!session) {
        return
    }
    session.setPermissionMode(selections.permissionMode)
    session.setModel(selections.model)
    session.setModelReasoningEffort(selections.modelReasoningEffort)
    logger.debug(
        `[loop] Synced session config for keepalive: permissionMode=${selections.permissionMode}, ` +
            `model=${selections.model ?? 'auto'}, reasoningEffort=${selections.modelReasoningEffort ?? 'auto'}`
    )
}

export function registerClaudeUserMessageHandler(options: {
    session: ApiSessionClient
    getCurrentSession: () => Session | null
    queue: MessageQueue2<EnhancedMode>
    selections: ClaudeRuntimeSelections
    pendingSessionContinuityHandoff: PendingSessionContinuityHandoffState
}): void {
    options.session.onUserMessage((message: UserMessage) => {
        const messageMeta = (message.meta ?? null) as Record<string, unknown> | null
        const liveSession = options.getCurrentSession()
        const sessionPermissionMode = liveSession?.getPermissionMode()
        if (sessionPermissionMode && isPermissionModeAllowedForDriver(sessionPermissionMode, 'claude')) {
            options.selections.permissionMode = sessionPermissionMode as PermissionMode
        }
        const sessionModel = liveSession?.getModel()
        if (sessionModel !== undefined) {
            options.selections.model = sessionModel
        }
        const sessionReasoning = liveSession?.getModelReasoningEffort()
        if (sessionReasoning !== undefined) {
            options.selections.modelReasoningEffort = sessionReasoning
        }

        const messagePermissionMode = options.selections.permissionMode
        const messageModel = options.selections.model ?? undefined
        logger.debug(
            `[loop] User message received with permission mode: ${options.selections.permissionMode}, ` +
                `model: ${options.selections.model ?? 'auto'}, reasoningEffort: ${options.selections.modelReasoningEffort ?? 'auto'}`
        )

        const messageCustomSystemPrompt = resolveStickyOverride({
            meta: messageMeta,
            key: 'customSystemPrompt',
            currentValue: options.selections.customSystemPrompt,
            updatedLabel: 'Custom system prompt',
            missingLabel: 'custom system prompt',
            read: readOptionalString,
            formatUpdatedValue: (value) => formatOverridePresence(value, 'reset to none'),
            formatCurrentValue: (value) => formatOverridePresence(value, 'none'),
        })
        options.selections.customSystemPrompt = messageCustomSystemPrompt

        const messageFallbackModel = resolveStickyOverride({
            meta: messageMeta,
            key: 'fallbackModel',
            currentValue: options.selections.fallbackModel,
            updatedLabel: 'Fallback model',
            missingLabel: 'fallback model',
            read: readOptionalString,
            formatUpdatedValue: (value) => formatOptionalStringValue(value, 'reset to none'),
            formatCurrentValue: (value) => formatOptionalStringValue(value, 'none'),
        })
        options.selections.fallbackModel = messageFallbackModel

        const messageAppendSystemPromptOverride = resolveStickyOverride({
            meta: messageMeta,
            key: 'appendSystemPrompt',
            currentValue: options.selections.appendSystemPromptOverride,
            updatedLabel: 'Append system prompt override',
            missingLabel: 'append system prompt',
            read: readOptionalString,
            formatUpdatedValue: (value) => formatOverridePresence(value, 'reset to none'),
            formatCurrentValue: (value) => formatOverridePresence(value, 'none'),
        })
        options.selections.appendSystemPromptOverride = messageAppendSystemPromptOverride
        const messageAppendSystemPrompt = mergePromptSegments(messageAppendSystemPromptOverride)

        const messageAllowedTools = resolveStickyOverride({
            meta: messageMeta,
            key: 'allowedTools',
            currentValue: options.selections.allowedTools,
            updatedLabel: 'Allowed tools',
            missingLabel: 'allowed tools',
            read: readOptionalStringList,
            formatUpdatedValue: (value) => formatOptionalStringListValue(value, 'reset to none'),
            formatCurrentValue: (value) => formatOptionalStringListValue(value, 'none'),
        })
        options.selections.allowedTools = messageAllowedTools

        const messageDisallowedTools = resolveStickyOverride({
            meta: messageMeta,
            key: 'disallowedTools',
            currentValue: options.selections.disallowedTools,
            updatedLabel: 'Disallowed tools',
            missingLabel: 'disallowed tools',
            read: readOptionalStringList,
            formatUpdatedValue: (value) => formatOptionalStringListValue(value, 'reset to none'),
            formatCurrentValue: (value) => formatOptionalStringListValue(value, 'none'),
        })
        options.selections.disallowedTools = messageDisallowedTools

        const formattedText = formatMessageWithAttachments(message.content.text, message.content.attachments)
        const specialCommand = parseSpecialCommand(message.content.text)
        const continuityInstructions = options.pendingSessionContinuityHandoff.consumeForUserMessage(formattedText)
        if (continuityInstructions) {
            logger.debug('[loop] Consuming pending Claude session continuity handoff on the first real user turn')
        }

        const enhancedMode: EnhancedMode = {
            permissionMode: messagePermissionMode ?? 'default',
            model: messageModel,
            modelReasoningEffort: options.selections.modelReasoningEffort,
            fallbackModel: messageFallbackModel,
            customSystemPrompt: messageCustomSystemPrompt,
            appendSystemPrompt: mergePromptSegments(messageAppendSystemPrompt, continuityInstructions),
            allowedTools: messageAllowedTools,
            disallowedTools: messageDisallowedTools,
        }

        if (specialCommand.type === 'compact' || specialCommand.type === 'clear') {
            options.queue.pushIsolateAndClear(specialCommand.originalMessage || message.content.text, enhancedMode)
            logger.debugLargeJson(`[start] /${specialCommand.type} command pushed to queue:`, message)
            return
        }

        options.queue.push(formattedText, enhancedMode)
        logger.debugLargeJson('User message pushed to queue:', message)
    })
}

export function registerClaudeSessionConfigHandler(options: {
    session: ApiSessionClient
    selections: ClaudeRuntimeSelections
    syncSessionModes: () => void
}): void {
    const resolveModel = (value: unknown): SessionModel => {
        if (value === null) {
            return null
        }
        if (typeof value !== 'string') {
            throw new Error('Invalid model')
        }
        return normalizeClaudeSessionModel(value)
    }

    const resolveModelReasoningEffort = (value: unknown): ClaudeSessionModelReasoningEffort => {
        if (value === null) {
            return null
        }
        const parsed = ClaudeReasoningEffortSchema.safeParse(value)
        if (!parsed.success) {
            throw new Error('Invalid model reasoning effort')
        }
        return parsed.data
    }

    options.session.rpcHandlerManager.registerHandler('set-session-config', async (payload: unknown) => {
        const config = assertSessionConfigPayload(payload) as {
            permissionMode?: unknown
            model?: unknown
            modelReasoningEffort?: unknown
        }
        if (config.permissionMode !== undefined) {
            options.selections.permissionMode = resolvePermissionModeForDriver(
                config.permissionMode,
                'claude'
            ) as PermissionMode
        }
        if (config.model !== undefined) {
            options.selections.model = resolveModel(config.model)
        }
        if (config.modelReasoningEffort !== undefined) {
            options.selections.modelReasoningEffort = resolveModelReasoningEffort(config.modelReasoningEffort)
        }
        options.syncSessionModes()
        return {
            applied: {
                permissionMode: options.selections.permissionMode,
                model: options.selections.model,
                modelReasoningEffort: options.selections.modelReasoningEffort,
            },
        }
    })
}
