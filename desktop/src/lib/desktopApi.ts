import { invoke } from '@tauri-apps/api/core'
import type { HubSnapshot, StartableEntryMode } from '@/types'

interface StartHubOptions {
    entryMode: StartableEntryMode
}

const DESKTOP_RUNTIME_UNAVAILABLE_MESSAGE = '当前运行在浏览器预览环境，Tauri runtime 不可用。请使用 bun run dev:desktop 启动桌面壳。'

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

export async function openUrl(url: string): Promise<void> {
    await invokeDesktopCommand('open_url', { url })
}

export async function copyText(text: string): Promise<void> {
    await invokeDesktopCommand('copy_text', { text })
}
