import { asRecord, asString, type ConvertedEvent, withTurnId } from './appServerEventParser'

const PLAN_CALL_ID_PREFIX = 'plan:'

export type PlanUpdateStep = {
    step: string
    status: 'pending' | 'in_progress' | 'completed'
}

type PlanUpdatePayload = {
    callId: string
    explanation?: string
    plan: PlanUpdateStep[]
}

function normalizePlanStatus(value: unknown): PlanUpdateStep['status'] {
    if (value === 'completed' || value === 'in_progress') {
        return value
    }
    return 'pending'
}

function extractTurnId(record: Record<string, unknown>): string | null {
    const turn = asRecord(record.turn)
    return asString(record.turn_id ?? record.turnId ?? turn?.id ?? turn?.turn_id ?? turn?.turnId)
}

function normalizePlanSteps(value: unknown): PlanUpdateStep[] {
    if (!Array.isArray(value)) {
        return []
    }

    const steps: PlanUpdateStep[] = []
    for (const entry of value) {
        const record = asRecord(entry)
        if (!record) {
            continue
        }
        const step = asString(record.step) ?? asString(record.content) ?? asString(record.label)
        if (!step) {
            continue
        }
        steps.push({
            step,
            status: normalizePlanStatus(record.status),
        })
    }

    return steps
}

function extractPlanSteps(record: Record<string, unknown>): PlanUpdateStep[] {
    const direct = normalizePlanSteps(record.plan ?? record.entries ?? record.steps)
    if (direct.length > 0) {
        return direct
    }

    const nestedPlan = asRecord(record.plan)
    if (nestedPlan) {
        return normalizePlanSteps(nestedPlan.entries ?? nestedPlan.steps)
    }

    return []
}

function extractPlanExplanation(record: Record<string, unknown>): string | undefined {
    const nestedPlan = asRecord(record.plan)
    return (
        asString(record.explanation) ??
        asString(nestedPlan?.explanation) ??
        asString(record.message) ??
        asString(record.summary) ??
        undefined
    )
}

function extractPlanUpdateCallId(record: Record<string, unknown>, turnId: string | null): string | null {
    const nestedPlan = asRecord(record.plan)
    const rawId =
        asString(record.call_id) ??
        asString(record.callId) ??
        asString(record.plan_id) ??
        asString(record.planId) ??
        asString(record.id) ??
        asString(nestedPlan?.id)

    if (rawId) {
        return `${PLAN_CALL_ID_PREFIX}${rawId}`
    }
    if (turnId) {
        return `${PLAN_CALL_ID_PREFIX}${turnId}`
    }
    return null
}

export function parsePlanUpdatePayload(params: Record<string, unknown>): PlanUpdatePayload | null {
    const turnId = extractTurnId(params)
    const plan = extractPlanSteps(params)
    const callId = extractPlanUpdateCallId(params, turnId)
    if (plan.length === 0 || !callId) {
        return null
    }

    const explanation = extractPlanExplanation(params)
    return {
        callId,
        ...(explanation ? { explanation } : {}),
        plan,
    }
}

export function createPlanUpdateEvent(params: Record<string, unknown>): ConvertedEvent[] {
    const payload = parsePlanUpdatePayload(params)
    if (!payload) {
        return []
    }

    const turnId = extractTurnId(params)
    return [
        withTurnId(
            {
                type: 'plan_update',
                call_id: payload.callId,
                plan: payload.plan,
                ...(payload.explanation ? { explanation: payload.explanation } : {}),
            },
            turnId
        ),
    ]
}
