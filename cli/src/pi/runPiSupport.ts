import { assertSessionConfigPayload, resolvePermissionModeForDriver } from '@/agent/providerConfig'
import type { PiPermissionMode, SessionModel, SessionModelReasoningEffort } from '@/api/types'
import type { ApiSessionClient } from '@/lib'
import { formatPiModel, resolvePiModel } from './launchConfig'
import { toPiThinkingLevel } from './messageCodec'
import type { PiRpcClient, PiRpcModel } from './piRpcClient'
import {
    createModeHash,
    getRuntimeStateFromPiState,
    type PiRuntimeState,
    recoverPiMessages,
    syncRuntimeSnapshot,
} from './runPiRuntimeState'

export { runPiPromptLoop } from './piPromptLoop'
export { subscribeToPiSessionEvents } from './piSessionEventBridge'
export type { PiRuntimeState } from './runPiRuntimeState'
export { createModeHash, getRuntimeStateFromPiState, recoverPiMessages, syncRuntimeSnapshot }

type SetSessionConfigPayload = {
    permissionMode?: unknown
    model?: unknown
    modelReasoningEffort?: unknown
}

function resolvePiConfigModel(options: {
    defaultModel: PiRpcModel | null | undefined
    selectableModels: readonly PiRpcModel[]
    model: unknown
}): SessionModel {
    if (options.model === null) return formatPiModel(options.defaultModel)
    if (typeof options.model !== 'string') throw new Error('Invalid Pi model')
    return formatPiModel(resolvePiModel(options.selectableModels, options.model)) ?? formatPiModel(options.defaultModel)
}

function resolvePiConfigReasoningEffort(value: unknown): SessionModelReasoningEffort {
    if (value === null) return null
    if (typeof value !== 'string') throw new Error('Invalid Pi model reasoning effort')
    const thinkingLevel = toPiThinkingLevel(value as SessionModelReasoningEffort)
    if (!thinkingLevel) throw new Error('Invalid Pi model reasoning effort')
    return thinkingLevel === 'off' ? 'none' : thinkingLevel
}

export function registerPiSessionConfigHandler(options: {
    session: ApiSessionClient
    rpcClient: PiRpcClient
    selectableModels: readonly PiRpcModel[]
    defaultModel: PiRpcModel | null | undefined
    getSelectedRuntimeState: () => PiRuntimeState
    applyRuntimeState: (runtimeState: PiRuntimeState, options?: { persistSelection?: boolean }) => Promise<void>
}): void {
    options.session.rpcHandlerManager.registerHandler('set-session-config', async (payload: unknown) => {
        const config = assertSessionConfigPayload(payload) as SetSessionConfigPayload
        const nextRuntimeState: PiRuntimeState = { ...options.getSelectedRuntimeState() }
        if (config.permissionMode !== undefined) {
            nextRuntimeState.permissionMode = resolvePermissionModeForDriver(
                config.permissionMode,
                'pi'
            ) as PiPermissionMode
        }
        if (config.model !== undefined) {
            nextRuntimeState.model = resolvePiConfigModel({
                defaultModel: options.defaultModel,
                selectableModels: options.selectableModels,
                model: config.model,
            })
        }
        if (config.modelReasoningEffort !== undefined) {
            nextRuntimeState.modelReasoningEffort = resolvePiConfigReasoningEffort(config.modelReasoningEffort)
        }
        await options.applyRuntimeState(nextRuntimeState, { persistSelection: true })
        return { applied: options.getSelectedRuntimeState() }
    })
}
