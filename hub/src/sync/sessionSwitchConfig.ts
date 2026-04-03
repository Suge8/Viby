import {
    AGENT_FLAVORS,
    isModelReasoningEffortAllowedForDriver,
    isPermissionModeAllowedForDriver,
    resolveSessionDriver,
    type SessionDriver,
    supportsLiveModelReasoningEffortForDriver,
    supportsLiveModelSelectionForDriver,
} from '@viby/protocol'
import { CodexCollaborationModeSchema } from '@viby/protocol/schemas'
import type { Session } from '@viby/protocol/types'

const COLLABORATION_DRIVER: SessionDriver = 'codex'
const SUPPORTED_TARGET_DRIVERS = new Set<SessionDriver>(AGENT_FLAVORS)

type SwitchConfigSession = Pick<
    Session,
    'metadata' | 'model' | 'modelReasoningEffort' | 'permissionMode' | 'collaborationMode'
>

export type NormalizedDriverSwitchSpawnConfig = {
    model: string | undefined
    modelReasoningEffort: Session['modelReasoningEffort'] | undefined
    permissionMode: Session['permissionMode'] | undefined
    collaborationMode: Session['collaborationMode'] | undefined
}

export function normalizeDriverSwitchSpawnConfig(
    session: SwitchConfigSession,
    targetDriver: SessionDriver
): NormalizedDriverSwitchSpawnConfig {
    if (!SUPPORTED_TARGET_DRIVERS.has(targetDriver)) {
        return createEmptyNormalizedConfig()
    }

    const sourceDriver = resolveSessionDriver(session.metadata)
    const preserveDriverSpecificConfig = sourceDriver === targetDriver

    return {
        model: normalizeModel(session.model, targetDriver, preserveDriverSpecificConfig),
        modelReasoningEffort: normalizeModelReasoningEffort(
            session.modelReasoningEffort,
            targetDriver,
            preserveDriverSpecificConfig
        ),
        permissionMode: normalizePermissionMode(session.permissionMode, targetDriver),
        collaborationMode: normalizeCollaborationMode(
            session.collaborationMode,
            targetDriver,
            preserveDriverSpecificConfig
        ),
    }
}

function createEmptyNormalizedConfig(): NormalizedDriverSwitchSpawnConfig {
    return {
        model: undefined,
        modelReasoningEffort: undefined,
        permissionMode: undefined,
        collaborationMode: undefined,
    }
}

function normalizeModel(
    model: Session['model'],
    targetDriver: SessionDriver,
    preserveDriverSpecificConfig: boolean
): string | undefined {
    if (!preserveDriverSpecificConfig || !supportsLiveModelSelectionForDriver(targetDriver)) {
        return undefined
    }
    if (typeof model !== 'string') {
        return undefined
    }

    const trimmedModel = model.trim()
    return trimmedModel.length > 0 ? trimmedModel : undefined
}

function normalizeModelReasoningEffort(
    modelReasoningEffort: Session['modelReasoningEffort'],
    targetDriver: SessionDriver,
    preserveDriverSpecificConfig: boolean
): Session['modelReasoningEffort'] | undefined {
    if (
        !preserveDriverSpecificConfig
        || !supportsLiveModelReasoningEffortForDriver(targetDriver)
        || typeof modelReasoningEffort !== 'string'
        || !isModelReasoningEffortAllowedForDriver(modelReasoningEffort, targetDriver)
    ) {
        return undefined
    }

    return modelReasoningEffort
}

function normalizePermissionMode(
    permissionMode: Session['permissionMode'],
    targetDriver: SessionDriver
): Session['permissionMode'] | undefined {
    if (
        typeof permissionMode !== 'string'
        || !isPermissionModeAllowedForDriver(permissionMode, targetDriver)
    ) {
        return undefined
    }

    return permissionMode
}

function normalizeCollaborationMode(
    collaborationMode: Session['collaborationMode'],
    targetDriver: SessionDriver,
    preserveDriverSpecificConfig: boolean
): Session['collaborationMode'] | undefined {
    if (!preserveDriverSpecificConfig || targetDriver !== COLLABORATION_DRIVER) {
        return undefined
    }

    const parsedMode = CodexCollaborationModeSchema.safeParse(collaborationMode)
    return parsedMode.success ? parsedMode.data : undefined
}
