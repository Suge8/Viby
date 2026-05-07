import type { Dispatch, SetStateAction } from 'react'
import type { DesktopPairingSession, HubSnapshot } from '@/types'

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
        options.setActionError(error instanceof Error ? error.message : '桌面操作失败。')
        return false
    } finally {
        options.setBusy(false)
    }
}

export async function createPairingAction(options: {
    tauriRuntimeAvailable: boolean
    setBusy: (value: boolean) => void
    setActionError: (value: string | null) => void
    setPairing: (value: DesktopPairingSession | null) => void
    createPairingSession: () => Promise<DesktopPairingSession>
}): Promise<void> {
    if (!options.tauriRuntimeAvailable) {
        options.setActionError(DESKTOP_PREVIEW_MESSAGE)
        return
    }

    options.setBusy(true)
    options.setActionError(null)
    try {
        options.setPairing(await options.createPairingSession())
    } catch (error) {
        options.setActionError(error instanceof Error ? error.message : '生成配对码失败。')
    } finally {
        options.setBusy(false)
    }
}

const STALE_PAIRING_DELETE_MESSAGES = ['Invalid pairing token', 'Pairing session not found'] as const
const STALE_PAIRING_REFRESH_MESSAGES = [...STALE_PAIRING_DELETE_MESSAGES, 'Pairing session no longer active'] as const

function hasKnownPairingError(error: unknown, messages: readonly string[]): boolean {
    return error instanceof Error && messages.some((message) => error.message.includes(message))
}

export function isStalePairingDeletionError(error: unknown): boolean {
    return hasKnownPairingError(error, STALE_PAIRING_DELETE_MESSAGES)
}

export function isStalePairingRefreshError(error: unknown): boolean {
    return hasKnownPairingError(error, STALE_PAIRING_REFRESH_MESSAGES)
}

export function isExpiredUnclaimedPairing(pairing: DesktopPairingSession, now: number = Date.now()): boolean {
    return !pairing.pairing.guest && now > pairing.pairing.ticketExpiresAt
}

export async function deletePairingAction(options: {
    tauriRuntimeAvailable: boolean
    pairing: DesktopPairingSession | null
    setBusy: (value: boolean) => void
    setActionError: (value: string | null) => void
    clearPairing: () => Promise<void>
    deletePairingSession: (pairing: DesktopPairingSession) => Promise<void>
}): Promise<void> {
    if (!options.tauriRuntimeAvailable) {
        options.setActionError(DESKTOP_PREVIEW_MESSAGE)
        return
    }

    if (!options.pairing) {
        options.setActionError('当前没有可解除的手机绑定。')
        return
    }

    options.setBusy(true)
    options.setActionError(null)
    try {
        try {
            await options.deletePairingSession(options.pairing)
        } catch (error) {
            if (!isStalePairingDeletionError(error)) {
                throw error
            }
        }
        await options.clearPairing()
    } catch (error) {
        options.setActionError(error instanceof Error ? error.message : '解除手机绑定失败。')
    } finally {
        options.setBusy(false)
    }
}

export async function recreatePairingAction(options: {
    tauriRuntimeAvailable: boolean
    pairing: DesktopPairingSession | null
    setBusy: (value: boolean) => void
    setActionError: (value: string | null) => void
    setPairing: (value: DesktopPairingSession | null) => void
    deletePairingSession: (pairing: DesktopPairingSession) => Promise<void>
    createPairingSession: () => Promise<DesktopPairingSession>
}): Promise<boolean> {
    if (!options.tauriRuntimeAvailable) {
        options.setActionError(DESKTOP_PREVIEW_MESSAGE)
        return false
    }

    if (!options.pairing) {
        options.setActionError('当前没有可刷新的配对。')
        return false
    }

    options.setBusy(true)
    options.setActionError(null)
    try {
        try {
            await options.deletePairingSession(options.pairing)
        } catch (error) {
            if (!isStalePairingDeletionError(error)) {
                throw error
            }
        }
        options.setPairing(await options.createPairingSession())
        return true
    } catch (error) {
        options.setActionError(error instanceof Error ? error.message : '刷新配对码失败。')
        return false
    } finally {
        options.setBusy(false)
    }
}
