import { LOCAL_SESSION_RECOVERY_DRIVERS, type LocalSessionRecoveryDriver } from '@viby/protocol'

export type NewSessionMode = 'start' | 'recover-local'

export const RECOVER_LOCAL_DRIVERS = LOCAL_SESSION_RECOVERY_DRIVERS

export type RecoverLocalDriver = LocalSessionRecoveryDriver

export const RECOVER_LOCAL_DRIVER_SELECTION_NONE = 'none'

export type RecoverLocalDriverSelection = typeof RECOVER_LOCAL_DRIVER_SELECTION_NONE | RecoverLocalDriver
