export const LOCAL_STORAGE_KEYS = {
    appearance: 'viby-appearance',
    appBuildId: 'viby-app-build-id',
    fontScale: 'viby-font-scale',
    hubUrl: 'viby_hub_url',
    installDismissed: 'pwa_install_dismissed',
    lastOpenedSession: 'viby:last-opened-session',
    localePreference: 'viby-lang-preference',
    newSessionDraft: 'viby:newSession:draft',
    newSessionLastUsed: 'viby:newSession:last-used',
    recentPaths: 'viby:recentPaths',
    recentSkills: 'viby-recent-skills',
    accessTokenPrefix: 'viby_access_token::',
    sessionTokenPrefix: 'viby_session_token::',
    testPrefix: 'viby:test-',
} as const

export const SESSION_STORAGE_KEYS = {
    appBootRecoverySurfaceOwner: 'viby-boot-recovery-surface-owner',
    appRecovery: 'viby-pending-app-recovery',
    appShellRevealed: 'viby-app-shell-revealed',
    localServiceWorkerReset: 'viby-local-service-worker-reset',
    runtimeAssetRecovery: 'viby-runtime-asset-recovery',
    runtimeUpdateSnapshot: 'viby-runtime-update-ready',
    testPrefix: 'viby:test-',
} as const

export const APP_CACHE_DB_NAME = 'viby-app-cache'
export const APP_CACHE_DB_VERSION = 1
export const APP_CACHE_BROADCAST_CHANNEL = 'viby-app-cache-events'

export const APP_CACHE_STORES = {
    composerDrafts: 'composer-drafts',
    messageWindowWarm: 'message-window-warm',
    sessionAttention: 'session-attention',
    sessionWarm: 'session-warm',
    sessionsWarm: 'sessions-warm',
} as const

type ValueOf<T> = T[keyof T]

export type AppCacheStoreName = ValueOf<typeof APP_CACHE_STORES>

export type BrowserLocalStorageKey =
    | ValueOf<typeof LOCAL_STORAGE_KEYS>
    | `${typeof LOCAL_STORAGE_KEYS.accessTokenPrefix}${string}`
    | `${typeof LOCAL_STORAGE_KEYS.sessionTokenPrefix}${string}`
    | `${typeof LOCAL_STORAGE_KEYS.testPrefix}${string}`

export type BrowserSessionStorageKey =
    | ValueOf<typeof SESSION_STORAGE_KEYS>
    | `${typeof SESSION_STORAGE_KEYS.testPrefix}${string}`

export type BrowserStorageKeyByKind = {
    local: BrowserLocalStorageKey
    session: BrowserSessionStorageKey
}

export function getAccessTokenStorageKey(baseUrl: string): BrowserLocalStorageKey {
    return `${LOCAL_STORAGE_KEYS.accessTokenPrefix}${baseUrl}`
}

export function getSessionTokenStorageKey(baseUrl: string): BrowserLocalStorageKey {
    return `${LOCAL_STORAGE_KEYS.sessionTokenPrefix}${baseUrl}`
}
