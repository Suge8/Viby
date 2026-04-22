import {
    AGENT_FLAVORS,
    isDriverSwitchCompatibleModelPresetForDriver,
    isModelReasoningEffortAllowedForDriver,
    isPermissionModeAllowedForDriver,
    type SessionDriver,
    supportsLiveModelReasoningEffortForDriver,
} from '@viby/protocol'
import { CodexCollaborationModeSchema } from '@viby/protocol/schemas'
import type { Session } from '@viby/protocol/types'
import type { SessionDurableConfigPatch } from './sessionPayloadTypes'

const COLLABORATION_DRIVER: SessionDriver = 'codex'
const SUPPORTED_TARGET_DRIVERS = new Set<SessionDriver>(AGENT_FLAVORS)

type SwitchConfigSession = Pick<Session, 'model' | 'modelReasoningEffort' | 'permissionMode' | 'collaborationMode'>

export type DriverSwitchSpawnConfig = {
    model?: string
    modelReasoningEffort?: Session['modelReasoningEffort'] | null
    permissionMode?: Session['permissionMode']
    collaborationMode?: Session['collaborationMode']
}

export type NormalizedDriverSwitchConfig = {
    durableConfig: SessionDurableConfigPatch
    spawnConfig: DriverSwitchSpawnConfig
}

export function normalizeDriverSwitchConfig(
    session: SwitchConfigSession,
    targetDriver: SessionDriver
): NormalizedDriverSwitchConfig {
    if (!SUPPORTED_TARGET_DRIVERS.has(targetDriver)) {
        return createEmptyNormalizedConfig()
    }

    const model = normalizeModel(session.model, targetDriver)
    const modelReasoningEffort = normalizeModelReasoningEffort(session.modelReasoningEffort, targetDriver)
    const permissionMode = normalizePermissionMode(session.permissionMode, targetDriver)
    const collaborationMode = normalizeCollaborationMode(session.collaborationMode, targetDriver)

    return {
        durableConfig: {
            model,
            modelReasoningEffort,
            permissionMode,
            collaborationMode,
        },
        spawnConfig: {
            model: model ?? undefined,
            modelReasoningEffort,
            permissionMode,
            collaborationMode: collaborationMode ?? undefined,
        },
    }
}

function createEmptyNormalizedConfig(): NormalizedDriverSwitchConfig {
    return {
        durableConfig: {
            model: undefined,
            modelReasoningEffort: undefined,
            permissionMode: undefined,
            collaborationMode: undefined,
        },
        spawnConfig: {
            model: undefined,
            modelReasoningEffort: undefined,
            permissionMode: undefined,
            collaborationMode: undefined,
        },
    }
}

function normalizeModel(model: Session['model'], targetDriver: SessionDriver): string | null {
    if (typeof model !== 'string') {
        return null
    }

    const trimmedModel = model.trim()
    if (!trimmedModel) {
        return null
    }

    return isDriverSwitchCompatibleModelPresetForDriver(trimmedModel, targetDriver) ? trimmedModel : null
}

function normalizeModelReasoningEffort(
    modelReasoningEffort: Session['modelReasoningEffort'],
    targetDriver: SessionDriver
): Session['modelReasoningEffort'] | null {
    if (
        !supportsLiveModelReasoningEffortForDriver(targetDriver) ||
        typeof modelReasoningEffort !== 'string' ||
        !isModelReasoningEffortAllowedForDriver(modelReasoningEffort, targetDriver)
    ) {
        return null
    }

    return modelReasoningEffort
}

function normalizePermissionMode(
    permissionMode: Session['permissionMode'],
    targetDriver: SessionDriver
): Session['permissionMode'] | undefined {
    if (typeof permissionMode === 'string' && isPermissionModeAllowedForDriver(permissionMode, targetDriver)) {
        return permissionMode
    }

    return isPermissionModeAllowedForDriver('default', targetDriver) ? 'default' : undefined
}

function normalizeCollaborationMode(
    collaborationMode: Session['collaborationMode'],
    targetDriver: SessionDriver
): Session['collaborationMode'] | null {
    if (targetDriver !== COLLABORATION_DRIVER) {
        return null
    }

    const parsedMode = CodexCollaborationModeSchema.safeParse(collaborationMode)
    return parsedMode.success ? parsedMode.data : 'default'
}
