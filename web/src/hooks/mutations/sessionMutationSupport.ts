import type { ApiClient } from '@/api/client'

export function getRequiredSessionTarget(
    api: ApiClient | null,
    sessionId: string | null
): { api: ApiClient; sessionId: string } {
    if (!api || !sessionId) {
        throw new Error('Session unavailable')
    }

    return { api, sessionId }
}

export function createSessionMutationFn<TVariables, TResult>(
    api: ApiClient | null,
    sessionId: string | null,
    run: (api: ApiClient, sessionId: string, variables: TVariables) => Promise<TResult>
): (variables: TVariables) => Promise<TResult> {
    return async (variables: TVariables) => {
        const target = getRequiredSessionTarget(api, sessionId)
        return await run(target.api, target.sessionId, variables)
    }
}

export function getMutationPendingState(mutations: ReadonlyArray<{ isPending: boolean }>): boolean {
    return mutations.some((mutation) => mutation.isPending)
}
