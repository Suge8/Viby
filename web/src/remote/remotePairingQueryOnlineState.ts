import { onlineManager, type QueryClient } from '@tanstack/react-query'

function isBrowserOnline(): boolean {
    return typeof navigator === 'undefined' ? true : navigator.onLine
}

function clearRemoteQueryErrors(queryClient: QueryClient): void {
    for (const query of queryClient.getQueryCache().findAll({ predicate: (item) => item.state.error !== null })) {
        if (query.state.data !== undefined) {
            queryClient.setQueryData(query.queryKey, query.state.data)
            continue
        }

        void queryClient.resetQueries({ queryKey: query.queryKey, exact: true }, { cancelRefetch: true })
    }
}

export function pauseRemotePairingQueries(queryClient: QueryClient): void {
    onlineManager.setOnline(false)
    void queryClient.cancelQueries()
    clearRemoteQueryErrors(queryClient)
}

export function resumeRemotePairingQueries(queryClient: QueryClient, options?: { refetch?: boolean }): void {
    onlineManager.setOnline(isBrowserOnline())
    if (!onlineManager.isOnline()) return

    void queryClient.resumePausedMutations()
    if (options?.refetch === true) {
        void queryClient.invalidateQueries()
    }
}
