import { asString, isObject } from '@viby/protocol'

export type PlanProgressStatus = 'pending' | 'in_progress' | 'completed'

export type PlanProgressItem = {
    step: string
    status: PlanProgressStatus
}

function normalizePlanProgressStatus(value: unknown): PlanProgressStatus {
    if (value === 'completed' || value === 'in_progress') {
        return value
    }
    return 'pending'
}

function extractPlanProgressStep(value: unknown): string | null {
    if (!isObject(value)) {
        return null
    }
    return asString(value.step) ?? asString(value.content) ?? asString(value.label)
}

export function extractPlanProgressItems(entries: unknown): PlanProgressItem[] {
    if (!Array.isArray(entries)) {
        return []
    }

    const items: PlanProgressItem[] = []
    for (const entry of entries) {
        const step = extractPlanProgressStep(entry)
        if (!step) {
            continue
        }
        items.push({
            step,
            status: normalizePlanProgressStatus(isObject(entry) ? entry.status : undefined),
        })
    }
    return items
}

export function extractPlanProgressExplanation(value: unknown): string | null {
    if (!isObject(value)) {
        return null
    }

    const explanation = value.explanation
    return typeof explanation === 'string' && explanation.trim().length > 0 ? explanation : null
}
