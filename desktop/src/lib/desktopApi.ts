import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { DesktopEntryMode, DesktopPairingSession, HubSnapshot } from '@/types'

interface StartHubOptions {
    entryMode: DesktopEntryMode
}

const DESKTOP_RUNTIME_UNAVAILABLE_MESSAGE =
    '当前运行在浏览器预览环境，Tauri runtime 不可用。请使用 bun run dev:desktop 启动桌面壳。'
const HUB_SNAPSHOT_EVENT = 'desktop://hub-snapshot'

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

export async function copyText(text: string): Promise<void> {
    await invokeDesktopCommand('copy_text', { text })
}

export async function createPairingSession(): Promise<DesktopPairingSession> {
    return await invokeDesktopCommand<DesktopPairingSession>('create_pairing_session')
}

export async function approvePairingSession(pairing: DesktopPairingSession): Promise<DesktopPairingSession> {
    return await invokeDesktopCommand<DesktopPairingSession>('approve_pairing_session', { pairing })
}

export async function deletePairingSession(pairing: DesktopPairingSession): Promise<void> {
    await invokeDesktopCommand('delete_pairing_session', { pairing })
}

export async function listenHubSnapshot(onSnapshot: (snapshot: HubSnapshot) => void): Promise<UnlistenFn> {
    ensureTauriRuntime()
    return await listen<HubSnapshot>(HUB_SNAPSHOT_EVENT, (event) => {
        onSnapshot(event.payload)
    })
}
