import type { QueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import { reconcileSessionView } from '@/lib/sessionViewReconciler'

type RunRealtimeRecoveryOptions = {
    queryClient: QueryClient
    api: ApiClient | null
    selectedSessionId: string | null
}

export async function runRealtimeRecovery(options: RunRealtimeRecoveryOptions): Promise<void> {
    await reconcileSessionView(options)
}
