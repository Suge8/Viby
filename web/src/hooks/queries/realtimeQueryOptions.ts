export const REALTIME_QUERY_STALE_TIME_MS = Infinity

export const realtimeQueryOptions = {
    staleTime: REALTIME_QUERY_STALE_TIME_MS,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
} as const
