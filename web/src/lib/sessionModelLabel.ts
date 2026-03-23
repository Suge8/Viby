import type { ModelReasoningEffort } from '@/types/api'
import {
    getModelReasoningEffortDisplayLabel,
    getSessionModelDisplayLabel
} from '@/lib/sessionConfigOptions'

type SessionModelSource = {
    model?: string | null
    modelReasoningEffort?: ModelReasoningEffort | null
    metadata?: {
        flavor?: string | null
    } | null
}

export type SessionModelLabel = {
    key: 'session.item.model'
    value: string
}

export function getSessionModelLabel(session: SessionModelSource): SessionModelLabel | null {
    const explicitModel = typeof session.model === 'string' ? session.model.trim() : ''
    if (explicitModel) {
        return {
            key: 'session.item.model',
            value: getSessionModelDisplayLabel(explicitModel, session.metadata?.flavor ?? null)
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
