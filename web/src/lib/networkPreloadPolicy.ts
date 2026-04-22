export type NetworkInformationLike = {
    saveData?: boolean
    effectiveType?: string
}

const SLOW_CONNECTION_TYPES = new Set(['slow-2g', '2g', '3g'])

export const SESSIONS_IDLE_PRELOAD_DELAY_MS = 1200

export function getNetworkInformation(): NetworkInformationLike | null {
    if (typeof navigator === 'undefined') {
        return null
    }

    const networkNavigator = navigator as Navigator & {
        connection?: NetworkInformationLike
        mozConnection?: NetworkInformationLike
        webkitConnection?: NetworkInformationLike
    }

    return networkNavigator.connection ?? networkNavigator.mozConnection ?? networkNavigator.webkitConnection ?? null
}

export function shouldPreloadIdleSessionRoutes(connection?: NetworkInformationLike | null): boolean {
    if (!connection) {
        return true
    }
    if (connection.saveData === true) {
        return false
    }
    const effectiveType = connection.effectiveType?.toLowerCase()
    if (!effectiveType) {
        return true
    }
    return !SLOW_CONNECTION_TYPES.has(effectiveType)
}

export function shouldPreloadForegroundSessionDetail(options?: {
    connection?: NetworkInformationLike | null
    visibilityState?: DocumentVisibilityState
}): boolean {
    if (options?.visibilityState === 'hidden') {
        return false
    }

    return shouldPreloadIdleSessionRoutes(options?.connection)
}
