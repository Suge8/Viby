import type { Dispatch, SetStateAction } from 'react'
import { deriveEntryModeFromListenHost, deriveInitialEntryMode } from '@/lib/entryMode'
import type { DesktopEntryMode, DesktopPairingSession, HubSnapshot } from '@/types'

export const DESKTOP_PREVIEW_MESSAGE =
    '当前运行在浏览器预览环境，Tauri runtime 不可用。请使用 bun run dev:desktop 启动桌面壳。'

export type HubControllerStateSetters = {
    setSnapshot: Dispatch<SetStateAction<HubSnapshot | null>>
    setActionError: Dispatch<SetStateAction<string | null>>
    setEntryMode: Dispatch<SetStateAction<DesktopEntryMode>>
}

export function applyHubSnapshot(
    nextSnapshot: HubSnapshot,
    options: HubControllerStateSetters & { useInitialEntryMode?: boolean }
): void {
    options.setSnapshot(nextSnapshot)
    options.setActionError(null)

    if (options.useInitialEntryMode) {
        options.setEntryMode(deriveInitialEntryMode(nextSnapshot))
        return
    }

    if (nextSnapshot.status && nextSnapshot.running) {
        options.setEntryMode(deriveEntryModeFromListenHost(nextSnapshot.status.listenHost))
    }
}

export async function runHubAction(options: {
    tauriRuntimeAvailable: boolean
    setBusy: (value: boolean) => void
    setActionError: (value: string | null) => void
    refresh: () => Promise<void>
    applySnapshot: (snapshot: HubSnapshot) => void
    clearPairing: () => void
    action: () => Promise<HubSnapshot | void>
}): Promise<void> {
    if (!options.tauriRuntimeAvailable) {
        options.setActionError(DESKTOP_PREVIEW_MESSAGE)
        return
    }

    options.setBusy(true)
    options.setActionError(null)
    try {
        const result = await options.action()
        if (result) {
            options.applySnapshot(result)
            if (!result.running) {
                options.clearPairing()
            }
        } else {
            await options.refresh()
        }
    } catch (error) {
        options.setActionError(error instanceof Error ? error.message : '桌面操作失败。')
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
