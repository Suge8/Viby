export type NewSessionMode = 'start' | 'recover-local'

export const RECOVER_LOCAL_DRIVERS = ['claude', 'codex', 'copilot', 'gemini', 'opencode', 'cursor', 'pi'] as const

export type RecoverLocalDriver = (typeof RECOVER_LOCAL_DRIVERS)[number]

export const RECOVER_LOCAL_DRIVER_SELECTION_NONE = 'none'

export type RecoverLocalDriverSelection = typeof RECOVER_LOCAL_DRIVER_SELECTION_NONE | RecoverLocalDriver
