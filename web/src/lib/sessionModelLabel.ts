import { resolveSessionDriver, type SessionDriver } from '@viby/protocol'
import { getSessionModelDisplayLabelWithCapabilities } from '@/lib/sessionConfigOptions'
import type { ModelReasoningEffort, PiModelScope } from '@/types/api'

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
            ),
        }
    }

    return null
}
