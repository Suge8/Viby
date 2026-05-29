import { z } from 'zod'
import type { AgentState } from './schemas'

export const SessionAttentionPatchSchema = z.object({
    pendingRequestsCount: z.number().int().nonnegative(),
    pendingRequestIds: z.array(z.string()),
})

export type SessionAttentionPatch = z.infer<typeof SessionAttentionPatchSchema>

export function getPendingRequestIds(agentState: AgentState | null | undefined): string[] {
    const requests = agentState?.requests
    return requests ? Object.keys(requests).sort() : []
}

export function buildSessionAttentionPatch(agentState: AgentState | null | undefined): SessionAttentionPatch {
    const pendingRequestIds = getPendingRequestIds(agentState)
    return {
        pendingRequestsCount: pendingRequestIds.length,
        pendingRequestIds,
    }
}

export function parseSessionAttentionPatch(value: unknown): SessionAttentionPatch | null {
    const result = SessionAttentionPatchSchema.safeParse(value)
    return result.success ? result.data : null
}
