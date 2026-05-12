import { useCallback, useEffect, useState } from 'react'
import {
    copyText,
    getHubSnapshot,
    isTauriRuntimeAvailable,
    listenHubSnapshot,
    openUrl as openConcreteUrl,
    setPublicAccessEnabled as persistPublicAccessEnabled,
    startHub,
    stopHub,
} from '@/lib/desktopApi'
import { readEntryModePreference, writeEntryModePreference } from '@/lib/desktopPreferences'
import type { HubAction } from '@/lib/desktopShellModel'
import { deriveInitialEntryMode } from '@/lib/entryMode'
import {
    applyHubSnapshot,
    DESKTOP_PREVIEW_MESSAGE,
    describeDesktopError,
    resolvePublicAccessEnabled,
    runHubAction,
} from '@/lib/hubControllerSupport'
import type { DesktopEntryMode, HubSnapshot } from '@/types'

interface HubControllerState {
    snapshot: HubSnapshot | null
    busy: boolean
    hubBusy: boolean
    hubAction: HubAction
    entryMode: DesktopEntryMode
    publicAccessEnabled: boolean
    actionError: string | null
    setEntryMode: (value: DesktopEntryMode) => void
    setPublicAccessEnabled: (value: boolean) => Promise<void>
    refresh: () => Promise<void>
    start: () => Promise<void>
    stop: () => Promise<void>
    copyValue: (value: string | undefined, emptyMessage: string) => Promise<boolean>
    openUrl: (url: string) => Promise<void>
}

export function useHubController(): HubControllerState {
    const [snapshot, setSnapshot] = useState<HubSnapshot | null>(null)
    const [busy, setBusy] = useState<boolean>(false)
    const [hubBusy, setHubBusy] = useState<boolean>(false)
    const [hubAction, setHubAction] = useState<HubAction>(null)
    const [entryMode, setEntryModeState] = useState<DesktopEntryMode>(() =>
        readEntryModePreference(globalThis.localStorage)
    )
    const [publicAccessEnabled, setPublicAccessEnabledState] = useState(true)
    const [actionError, setActionError] = useState<string | null>(null)
    const tauriRuntimeAvailable = isTauriRuntimeAvailable()

    const setEntryMode = useCallback((value: DesktopEntryMode): void => {
        setEntryModeState(value)
        writeEntryModePreference(globalThis.localStorage, value)
    }, [])

    const applySnapshot = useCallback(
        (nextSnapshot: HubSnapshot, useInitialEntryMode = false) => {
            applyHubSnapshot(nextSnapshot, {
                setSnapshot,
                setActionError,
            })
            setPublicAccessEnabledState(resolvePublicAccessEnabled(nextSnapshot))
            if (useInitialEntryMode && nextSnapshot.running) {
                setEntryMode(deriveInitialEntryMode(nextSnapshot))
            }
        },
        [setActionError, setEntryMode, setSnapshot]
    )

    const refresh = useCallback(async (): Promise<void> => {
        applySnapshot(await getHubSnapshot())
    }, [applySnapshot])

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
                    if (!stopped) {
                        applySnapshot(nextSnapshot)
                    }
                })

                const nextSnapshot = await getHubSnapshot()
                if (!stopped) {
                    applySnapshot(nextSnapshot, true)
                }
            } catch (error) {
                if (!stopped) {
                    setActionError(describeDesktopError(error, '读取中枢状态失败。'))
                }
            }
        }

        void connectSnapshotStream()
        return () => {
            stopped = true
            teardownListener?.()
        }
    }, [applySnapshot, tauriRuntimeAvailable])

    const runAction = useCallback(
        async (action: () => Promise<HubSnapshot | void>): Promise<boolean> => {
            return await runHubAction({
                tauriRuntimeAvailable,
                setBusy,
                setActionError,
                refresh,
                applySnapshot: (nextSnapshot) => applySnapshot(nextSnapshot),
                action,
            })
        },
        [applySnapshot, refresh, tauriRuntimeAvailable]
    )

    const setPublicAccessEnabled = useCallback(
        async (value: boolean): Promise<void> => {
            if (snapshot?.running) {
                setActionError('中枢运行中，关闭后可更改公网访问。')
                return
            }

            const previousValue = publicAccessEnabled
            setPublicAccessEnabledState(value)
            const ok = await runAction(async () => {
                await persistPublicAccessEnabled(value)
            })
            if (!ok) setPublicAccessEnabledState(previousValue)
        },
        [publicAccessEnabled, runAction, snapshot?.running]
    )

    const start = useCallback(async (): Promise<void> => {
        setHubBusy(true)
        setHubAction('start')
        try {
            await runAction(() => startHub({ entryMode }))
        } finally {
            setHubBusy(false)
            setHubAction(null)
        }
    }, [entryMode, runAction])

    const stop = useCallback(async (): Promise<void> => {
        setHubBusy(true)
        setHubAction('stop')
        try {
            await runAction(() => stopHub())
        } finally {
            setHubBusy(false)
            setHubAction(null)
        }
    }, [runAction])

    const copyValue = useCallback(
        async (value: string | undefined, emptyMessage: string): Promise<boolean> => {
            return await runAction(async () => {
                if (!value) {
                    throw new Error(emptyMessage)
                }
                await copyText(value)
            })
        },
        [runAction]
    )

    const openUrl = useCallback(
        async (url: string): Promise<void> => {
            if (!tauriRuntimeAvailable) {
                setActionError(DESKTOP_PREVIEW_MESSAGE)
                return
            }
            setActionError(null)
            try {
                await openConcreteUrl(url)
            } catch (error) {
                setActionError(describeDesktopError(error, '打开入口失败。'))
            }
        },
        [tauriRuntimeAvailable]
    )

    return {
        snapshot,
        busy,
        hubBusy,
        hubAction,
        entryMode,
        publicAccessEnabled,
        actionError,
        setEntryMode,
        setPublicAccessEnabled,
        refresh,
        start,
        stop,
        copyValue,
        openUrl,
    }
}
