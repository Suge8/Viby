import type { Dispatch, SetStateAction } from 'react'
import type { HubSnapshot } from '@/types'

export const DESKTOP_PREVIEW_MESSAGE =
    '当前运行在浏览器预览环境，Tauri runtime 不可用。请使用 bun run dev:desktop 启动桌面壳。'

export type HubControllerStateSetters = {
    setSnapshot: Dispatch<SetStateAction<HubSnapshot | null>>
    setActionError: Dispatch<SetStateAction<string | null>>
}

export function applyHubSnapshot(nextSnapshot: HubSnapshot, options: HubControllerStateSetters): void {
    options.setSnapshot(nextSnapshot)
    options.setActionError(null)
}

export function describeDesktopError(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message.trim()) return error.message
    if (typeof error === 'string' && error.trim()) return error
    return fallback
}

export function resolvePublicAccessEnabled(snapshot: HubSnapshot): boolean {
    if (snapshot.running && snapshot.status) return snapshot.status.publicAccessEnabled
    return snapshot.startupConfig.publicAccessEnabled
}

export async function runHubAction(options: {
    tauriRuntimeAvailable: boolean
    setBusy: (value: boolean) => void
    setActionError: (value: string | null) => void
    refresh: () => Promise<void>
    applySnapshot: (snapshot: HubSnapshot) => void
    action: () => Promise<HubSnapshot | void>
}): Promise<boolean> {
    if (!options.tauriRuntimeAvailable) {
        options.setActionError(DESKTOP_PREVIEW_MESSAGE)
        return false
    }

    options.setBusy(true)
    options.setActionError(null)
    try {
        const result = await options.action()
        if (result) {
            options.applySnapshot(result)
        } else {
            await options.refresh()
        }
        return true
    } catch (error) {
        options.setActionError(describeDesktopError(error, '桌面操作失败。'))
        return false
    } finally {
        options.setBusy(false)
    }
}

const STALE_PAIRING_DELETE_MESSAGES = ['Invalid pairing token', 'Pairing session not found'] as const
const STALE_PAIRING_REFRESH_MESSAGES = [...STALE_PAIRING_DELETE_MESSAGES, 'Pairing session no longer active'] as const

function hasKnownPairingError(error: unknown, messages: readonly string[]): boolean {
    const message = error instanceof Error ? error.message : typeof error === 'string' ? error : null
    return message !== null && messages.some((known) => message.includes(known))
}

export function isStalePairingDeletionError(error: unknown): boolean {
    return hasKnownPairingError(error, STALE_PAIRING_DELETE_MESSAGES)
}

export function isStalePairingRefreshError(error: unknown): boolean {
    return hasKnownPairingError(error, STALE_PAIRING_REFRESH_MESSAGES)
}

export { isExpiredUnapprovedPairing } from './desktopShellModel'
