import { useCallback, useEffect, useState } from 'react'
import {
    clearPairingSession,
    copyText,
    createPairingSession,
    deletePairingSession,
    getHubSnapshot,
    getPairingSession,
    isTauriRuntimeAvailable,
    listenHubSnapshot,
    openUrl as openConcreteUrl,
    refreshPairingSession,
    startHub,
    stopHub,
} from '@/lib/desktopApi'
import { readEntryModePreference, writeEntryModePreference } from '@/lib/desktopPreferences'
import type { HubAction } from '@/lib/desktopShellModel'
import { deriveInitialEntryMode } from '@/lib/entryMode'
import {
    applyHubSnapshot,
    createPairingAction,
    DESKTOP_PREVIEW_MESSAGE,
    deletePairingAction,
    isExpiredUnclaimedPairing,
    isStalePairingRefreshError,
    recreatePairingAction,
    runHubAction,
} from '@/lib/hubControllerSupport'
import type { DesktopEntryMode, DesktopPairingSession, HubSnapshot } from '@/types'

interface HubControllerState {
    snapshot: HubSnapshot | null
    busy: boolean
    hubBusy: boolean
    hubAction: HubAction
    entryMode: DesktopEntryMode
    actionError: string | null
    pairing: DesktopPairingSession | null
    setEntryMode: (value: DesktopEntryMode) => void
    refresh: () => Promise<void>
    start: () => Promise<void>
    stop: () => Promise<void>
    copyValue: (value: string | undefined, emptyMessage: string) => Promise<boolean>
    openUrl: (url: string) => Promise<void>
    createPairing: () => Promise<void>
    refreshPairing: () => Promise<void>
    recreatePairing: () => Promise<boolean>
    deletePairing: () => Promise<void>
}

export function useHubController(): HubControllerState {
    const [snapshot, setSnapshot] = useState<HubSnapshot | null>(null)
    const [busy, setBusy] = useState<boolean>(false)
    const [hubBusy, setHubBusy] = useState<boolean>(false)
    const [hubAction, setHubAction] = useState<HubAction>(null)
    const [entryMode, setEntryModeState] = useState<DesktopEntryMode>(() =>
        readEntryModePreference(globalThis.localStorage)
    )
    const [actionError, setActionError] = useState<string | null>(null)
    const [pairing, setPairing] = useState<DesktopPairingSession | null>(null)
    const tauriRuntimeAvailable = isTauriRuntimeAvailable()

    const clearPairing = useCallback(async (): Promise<void> => {
        setPairing(null)
        if (tauriRuntimeAvailable) {
            await clearPairingSession()
        }
    }, [tauriRuntimeAvailable])

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
                    setActionError(error instanceof Error ? error.message : '读取中枢状态失败。')
                }
            }
        }

        void connectSnapshotStream()
        return () => {
            stopped = true
            teardownListener?.()
        }
    }, [applySnapshot, tauriRuntimeAvailable])

    useEffect(() => {
        if (!tauriRuntimeAvailable) return
        let stopped = false

        async function loadPairing(): Promise<void> {
            try {
                const stored = await getPairingSession()
                if (stopped || !stored) return
                if (isExpiredUnclaimedPairing(stored)) {
                    await clearPairingSession()
                    return
                }
                setPairing(stored)
            } catch (error) {
                if (!stopped) setActionError(error instanceof Error ? error.message : '读取手机绑定失败。')
            }
        }

        void loadPairing()
        return () => {
            stopped = true
        }
    }, [tauriRuntimeAvailable])

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
                setActionError(error instanceof Error ? error.message : '打开入口失败。')
            }
        },
        [tauriRuntimeAvailable]
    )

    const createPairing = useCallback(async (): Promise<void> => {
        await createPairingAction({
            tauriRuntimeAvailable,
            setBusy,
            setActionError,
            setPairing,
            createPairingSession,
        })
    }, [tauriRuntimeAvailable])

    const refreshPairing = useCallback(async (): Promise<void> => {
        if (!tauriRuntimeAvailable || !pairing) {
            return
        }

        try {
            const nextPairing = await refreshPairingSession(pairing)
            if (isExpiredUnclaimedPairing(nextPairing)) {
                await clearPairing()
                return
            }
            setPairing(nextPairing)
        } catch (error) {
            if (isStalePairingRefreshError(error)) {
                await clearPairing()
                return
            }
            setActionError(error instanceof Error ? error.message : '刷新配对状态失败。')
        }
    }, [clearPairing, pairing, tauriRuntimeAvailable])

    const recreatePairing = useCallback(async (): Promise<boolean> => {
        return await recreatePairingAction({
            tauriRuntimeAvailable,
            pairing,
            setBusy,
            setActionError,
            setPairing,
            deletePairingSession,
            createPairingSession,
        })
    }, [pairing, tauriRuntimeAvailable])

    const deletePairing = useCallback(async (): Promise<void> => {
        await deletePairingAction({
            tauriRuntimeAvailable,
            pairing,
            setBusy,
            setActionError,
            clearPairing,
            deletePairingSession,
        })
    }, [clearPairing, pairing, tauriRuntimeAvailable])

    return {
        snapshot,
        busy,
        hubBusy,
        hubAction,
        entryMode,
        actionError,
        pairing,
        setEntryMode,
        refresh,
        start,
        stop,
        copyValue,
        openUrl,
        createPairing,
        refreshPairing,
        recreatePairing,
        deletePairing,
    }
}
