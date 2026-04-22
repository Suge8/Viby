import { useCallback, useEffect, useState } from 'react'
import {
    approvePairingSession,
    copyText,
    createPairingSession,
    deletePairingSession,
    getHubSnapshot,
    isTauriRuntimeAvailable,
    listenHubSnapshot,
    openPreferredUrl,
    startHub,
    stopHub,
} from '@/lib/desktopApi'
import {
    applyHubSnapshot,
    createPairingAction,
    DESKTOP_PREVIEW_MESSAGE,
    runHubAction,
} from '@/lib/hubControllerSupport'
import type { DesktopEntryMode, DesktopPairingSession, HubSnapshot } from '@/types'

interface HubControllerState {
    snapshot: HubSnapshot | null
    busy: boolean
    entryMode: DesktopEntryMode
    actionError: string | null
    pairing: DesktopPairingSession | null
    refresh: () => Promise<void>
    setEntryMode: (nextValue: DesktopEntryMode) => void
    start: () => Promise<void>
    stop: () => Promise<void>
    openPreferred: () => Promise<void>
    copyValue: (value: string | undefined, emptyMessage: string) => Promise<void>
    createPairing: () => Promise<void>
    approvePairing: () => Promise<void>
    recreatePairing: () => Promise<void>
    clearPairing: () => Promise<void>
}

async function readSnapshot(): Promise<HubSnapshot> {
    return getHubSnapshot()
}

export function useHubController(): HubControllerState {
    const [snapshot, setSnapshot] = useState<HubSnapshot | null>(null)
    const [busy, setBusy] = useState<boolean>(false)
    const [entryMode, setEntryMode] = useState<DesktopEntryMode>('local')
    const [actionError, setActionError] = useState<string | null>(null)
    const [pairing, setPairing] = useState<DesktopPairingSession | null>(null)
    const tauriRuntimeAvailable = isTauriRuntimeAvailable()

    const applySnapshot = useCallback(
        (nextSnapshot: HubSnapshot, useInitialEntryMode?: boolean) => {
            applyHubSnapshot(nextSnapshot, {
                setSnapshot,
                setActionError,
                setEntryMode,
                useInitialEntryMode,
            })
        },
        [setActionError, setEntryMode, setSnapshot]
    )

    const refresh = useCallback(async (): Promise<void> => {
        applySnapshot(await readSnapshot())
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

                const nextSnapshot = await readSnapshot()
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

    const runAction = useCallback(
        async (action: () => Promise<HubSnapshot | void>): Promise<void> => {
            await runHubAction({
                tauriRuntimeAvailable,
                setBusy,
                setActionError,
                refresh,
                applySnapshot: (nextSnapshot) => applySnapshot(nextSnapshot),
                clearPairing: () => setPairing(null),
                action,
            })
        },
        [applySnapshot, refresh, tauriRuntimeAvailable]
    )

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

    const copyValue = useCallback(
        async (value: string | undefined, emptyMessage: string): Promise<void> => {
            await runAction(async () => {
                if (!value) {
                    throw new Error(emptyMessage)
                }
                await copyText(value)
            })
        },
        [runAction]
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

    const runPairingMutation = useCallback(
        async (
            action: (currentPairing: DesktopPairingSession) => Promise<DesktopPairingSession | void>,
            emptyMessage: string,
            fallbackError: string
        ): Promise<void> => {
            if (!tauriRuntimeAvailable) {
                setActionError(DESKTOP_PREVIEW_MESSAGE)
                return
            }

            if (!pairing) {
                setActionError(emptyMessage)
                return
            }

            setBusy(true)
            setActionError(null)
            try {
                const nextPairing = await action(pairing)
                setPairing(nextPairing ?? null)
            } catch (error) {
                setActionError(error instanceof Error ? error.message : fallbackError)
            } finally {
                setBusy(false)
            }
        },
        [pairing, tauriRuntimeAvailable]
    )

    const approvePairing = useCallback(async (): Promise<void> => {
        await runPairingMutation(
            async (currentPairing) => await approvePairingSession(currentPairing),
            '当前没有可批准的配对。',
            '批准配对失败。'
        )
    }, [runPairingMutation])

    const recreatePairing = useCallback(async (): Promise<void> => {
        await runPairingMutation(
            async (currentPairing) => {
                await deletePairingSession(currentPairing)
                return await createPairingSession()
            },
            '当前没有可刷新的配对。',
            '刷新配对码失败。'
        )
    }, [runPairingMutation])

    const clearPairing = useCallback(async (): Promise<void> => {
        await runPairingMutation(
            async (currentPairing) => {
                await deletePairingSession(currentPairing)
            },
            '当前没有可结束的配对。',
            '结束配对失败。'
        )
    }, [runPairingMutation])

    return {
        snapshot,
        busy,
        entryMode,
        actionError,
        pairing,
        refresh,
        setEntryMode,
        start,
        stop,
        openPreferred,
        copyValue,
        createPairing,
        approvePairing,
        recreatePairing,
        clearPairing,
    }
}
