import { type Dispatch, type SetStateAction, useCallback, useEffect, useMemo, useState } from 'react'
import {
    copyText,
    getHubSnapshot,
    isTauriRuntimeAvailable,
    listenHubSnapshot,
    openPreferredUrl,
    startHub,
    stopHub
} from '@/lib/desktopApi'
import { deriveEntryModeFromListenHost, deriveInitialEntryMode } from '@/lib/entryMode'
import type { DesktopEntryMode, HubSnapshot } from '@/types'

const DESKTOP_PREVIEW_MESSAGE = '当前运行在浏览器预览环境，Tauri runtime 不可用。请使用 bun run dev:desktop 启动桌面壳。'

interface HubControllerState {
    snapshot: HubSnapshot | null
    busy: boolean
    entryMode: DesktopEntryMode
    actionError: string | null
    refresh: () => Promise<void>
    setEntryMode: (nextValue: DesktopEntryMode) => void
    start: () => Promise<void>
    stop: () => Promise<void>
    openPreferred: () => Promise<void>
    copyValue: (value: string | undefined, emptyMessage: string) => Promise<void>
}

async function readSnapshot(): Promise<HubSnapshot> {
    return getHubSnapshot()
}

function applySnapshot(
    nextSnapshot: HubSnapshot,
    options: {
        setSnapshot: Dispatch<SetStateAction<HubSnapshot | null>>
        setActionError: Dispatch<SetStateAction<string | null>>
        setEntryMode: Dispatch<SetStateAction<DesktopEntryMode>>
        useInitialEntryMode?: boolean
    }
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

export function useHubController(): HubControllerState {
    const [snapshot, setSnapshot] = useState<HubSnapshot | null>(null)
    const [busy, setBusy] = useState<boolean>(false)
    const [entryMode, setEntryMode] = useState<DesktopEntryMode>('local')
    const [actionError, setActionError] = useState<string | null>(null)
    const tauriRuntimeAvailable = isTauriRuntimeAvailable()

    const refresh = useCallback(async (): Promise<void> => {
        const nextSnapshot = await readSnapshot()
        applySnapshot(nextSnapshot, { setSnapshot, setActionError, setEntryMode })
    }, [])

    useEffect(() => {
        if (!tauriRuntimeAvailable) {
            setActionError(DESKTOP_PREVIEW_MESSAGE)
            return
        }

        let stopped = false
        let teardownListener: (() => void) | null = null

        async function connectSnapshotStream(): Promise<void> {
            try {
                teardownListener = await listenHubSnapshot((nextSnapshot) => {
                    if (stopped) {
                        return
                    }
                    applySnapshot(nextSnapshot, { setSnapshot, setActionError, setEntryMode })
                })

                const nextSnapshot = await readSnapshot()
                if (stopped) {
                    return
                }
                applySnapshot(nextSnapshot, {
                    setSnapshot,
                    setActionError,
                    setEntryMode,
                    useInitialEntryMode: true
                })
            } catch (error) {
                if (!stopped) {
                    setActionError(error instanceof Error ? error.message : '读取中枢状态失败。')
                }
            }
        }

        void connectSnapshotStream()

        return () => {
            stopped = true
            teardownListener?.()
        }
    }, [tauriRuntimeAvailable])

    const runAction = useCallback(async (action: () => Promise<HubSnapshot | void>): Promise<void> => {
        if (!tauriRuntimeAvailable) {
            setActionError(DESKTOP_PREVIEW_MESSAGE)
            return
        }

        setBusy(true)
        setActionError(null)
        try {
            const result = await action()
            if (result) {
                applySnapshot(result, { setSnapshot, setActionError, setEntryMode })
            } else {
                await refresh()
            }
        } catch (error) {
            setActionError(error instanceof Error ? error.message : '桌面操作失败。')
        } finally {
            setBusy(false)
        }
    }, [refresh, tauriRuntimeAvailable])

    const start = useCallback(async (): Promise<void> => {
        await runAction(() => startHub({ entryMode }))
    }, [entryMode, runAction])

    const stop = useCallback(async (): Promise<void> => {
        await runAction(() => stopHub())
    }, [runAction])

    const openPreferred = useCallback(async (): Promise<void> => {
        await runAction(async () => {
            if (!snapshot?.status?.preferredBrowserUrl) {
                throw new Error('当前还没有可打开的网址。')
            }
            await openPreferredUrl()
        })
    }, [runAction, snapshot?.status?.preferredBrowserUrl])

    const copyValue = useCallback(async (value: string | undefined, emptyMessage: string): Promise<void> => {
        await runAction(async () => {
            if (!value) {
                throw new Error(emptyMessage)
            }
            await copyText(value)
        })
    }, [runAction])

    return useMemo(() => ({
        snapshot,
        busy,
        entryMode,
        actionError,
        refresh,
        setEntryMode,
        start,
        stop,
        openPreferred,
        copyValue
    }), [
        actionError,
        busy,
        copyValue,
        entryMode,
        openPreferred,
        refresh,
        snapshot,
        start,
        stop
    ])
}
