import type { ChildProcess } from 'node:child_process'
import type { Metadata } from '@/api/types'
import type { ProviderAdapterBridge } from './providerAdapterBridge'

export const APP_CORE_MANAGED_STARTED_BY = 'app-core'
export const EXTERNAL_TERMINAL_STARTED_BY = 'terminal'

export interface TrackedSession {
    startedBy: typeof APP_CORE_MANAGED_STARTED_BY | typeof EXTERNAL_TERMINAL_STARTED_BY
    vibySessionId?: string
    vibySessionMetadataFromLocalWebhook?: Metadata
    pid: number
    childProcess?: ChildProcess
    adapterBridge?: ProviderAdapterBridge
    error?: string
    directoryCreated?: boolean
    message?: string
    spawnAbandoned?: boolean
}
