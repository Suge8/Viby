import { resolveSessionDriver, type SessionDriver } from '@viby/protocol'
import type { ModelReasoningEffort, PiModelScope } from '@/types/api'
import {
    getModelReasoningEffortDisplayLabel,
    getSessionModelDisplayLabelWithCapabilities
} from '@/lib/sessionConfigOptions'

type SessionModelSource = {
    model?: string | null
    modelReasoningEffort?: ModelReasoningEffort | null
    metadata?: {
        driver?: SessionDriver | null
        piModelScope?: PiModelScope
    } | null
}

export type SessionModelLabel = {
    key: 'session.item.model'
    value: string
}

export function getSessionModelLabel(session: SessionModelSource): SessionModelLabel | null {
    const explicitModel = typeof session.model === 'string' ? session.model.trim() : ''
    if (explicitModel) {
        const driver = resolveSessionDriver(session.metadata)
        return {
            key: 'session.item.model',
            value: getSessionModelDisplayLabelWithCapabilities(
                explicitModel,
                driver,
                driver === 'pi' ? session.metadata?.piModelScope?.models : undefined
            )
        }
    }

    return null
}

export function getSessionReasoningEffortLabel(session: SessionModelSource): string | null {
    const effort = session.modelReasoningEffort
    if (!effort) {
        return null
    }

    return getModelReasoningEffortDisplayLabel(effort)
}
