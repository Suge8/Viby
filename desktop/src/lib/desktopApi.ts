import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { check, type Update } from '@tauri-apps/plugin-updater'
import type { DesktopEntryMode, DesktopPairingSession, HubSnapshot } from '@/types'

interface StartHubOptions {
    entryMode: DesktopEntryMode
}

export interface DesktopUpdateInfo {
    version: string
    currentVersion: string
    date?: string
    body?: string
}

const DESKTOP_RUNTIME_UNAVAILABLE_MESSAGE =
    '当前运行在浏览器预览环境，Tauri runtime 不可用。请使用 bun run dev:desktop 启动桌面壳。'
const HUB_SNAPSHOT_EVENT = 'desktop://hub-snapshot'

let pendingUpdate: Update | null = null

type TauriInternals = {
    invoke?: unknown
}

type TauriWindow = Window & {
    __TAURI_INTERNALS__?: TauriInternals
}

export function isTauriRuntimeAvailable(): boolean {
    if (typeof window === 'undefined') {
        return false
    }

    const tauriWindow = window as TauriWindow
    return typeof tauriWindow.__TAURI_INTERNALS__?.invoke === 'function'
}

function ensureTauriRuntime(): void {
    if (!isTauriRuntimeAvailable()) {
        throw new Error(DESKTOP_RUNTIME_UNAVAILABLE_MESSAGE)
    }
}

async function invokeDesktopCommand<T>(command: string, payload?: Record<string, unknown>): Promise<T> {
    ensureTauriRuntime()
    return await invoke<T>(command, payload)
}

function toDesktopUpdateInfo(update: Update): DesktopUpdateInfo {
    return {
        version: update.version,
        currentVersion: update.currentVersion,
        date: update.date,
        body: update.body,
    }
}

async function replacePendingUpdate(update: Update | null): Promise<void> {
    const previousUpdate = pendingUpdate
    pendingUpdate = update

    if (previousUpdate && previousUpdate !== update) {
        await previousUpdate.close()
    }
}

export async function getHubSnapshot(): Promise<HubSnapshot> {
    return await invokeDesktopCommand<HubSnapshot>('get_hub_snapshot')
}

export async function startHub(options: StartHubOptions): Promise<HubSnapshot> {
    return await invokeDesktopCommand<HubSnapshot>('start_hub', { options })
}

export async function stopHub(): Promise<HubSnapshot> {
    return await invokeDesktopCommand<HubSnapshot>('stop_hub')
}

export async function openPreferredUrl(): Promise<void> {
    await invokeDesktopCommand('open_preferred_url')
}

export async function openUrl(url: string): Promise<void> {
    await invokeDesktopCommand('open_url', { url })
}

export async function copyText(text: string): Promise<void> {
    await invokeDesktopCommand('copy_text', { text })
}

export async function getPairingSession(): Promise<DesktopPairingSession | null> {
    return await invokeDesktopCommand<DesktopPairingSession | null>('get_pairing_session')
}

export async function clearPairingSession(): Promise<void> {
    await invokeDesktopCommand('clear_pairing_session')
}

export async function createPairingSession(): Promise<DesktopPairingSession> {
    return await invokeDesktopCommand<DesktopPairingSession>('create_pairing_session')
}

export async function approvePairingSession(pairing: DesktopPairingSession): Promise<DesktopPairingSession> {
    return await invokeDesktopCommand<DesktopPairingSession>('approve_pairing_session', { pairing })
}

export async function refreshPairingSession(pairing: DesktopPairingSession): Promise<DesktopPairingSession> {
    return await invokeDesktopCommand<DesktopPairingSession>('refresh_pairing_session', { pairing })
}

export async function deletePairingSession(pairing: DesktopPairingSession): Promise<void> {
    await invokeDesktopCommand('delete_pairing_session', { pairing })
}

export async function checkForDesktopUpdate(): Promise<DesktopUpdateInfo | null> {
    ensureTauriRuntime()
    const update = await check()
    await replacePendingUpdate(update)
    return update ? toDesktopUpdateInfo(update) : null
}

export async function installDesktopUpdate(): Promise<void> {
    ensureTauriRuntime()
    const update = pendingUpdate ?? (await check())

    if (!update) {
        throw new Error('没有可安装的桌面更新。')
    }

    pendingUpdate = null
    await update.downloadAndInstall()
    await update.close()
}

export async function listenHubSnapshot(onSnapshot: (snapshot: HubSnapshot) => void): Promise<UnlistenFn> {
    ensureTauriRuntime()
    return await listen<HubSnapshot>(HUB_SNAPSHOT_EVENT, (event) => {
        onSnapshot(event.payload)
    })
}
