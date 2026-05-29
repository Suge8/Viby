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
import type { HubAction } from '@/lib/desktopShellModel'
import {
    applyHubSnapshot,
    DESKTOP_PREVIEW_MESSAGE,
    describeDesktopError,
    resolvePublicAccessEnabled,
    runHubAction,
} from '@/lib/hubControllerSupport'
import type { HubSnapshot } from '@/types'

interface HubControllerState {
    snapshot: HubSnapshot | null
    busy: boolean
    hubBusy: boolean
    hubAction: HubAction
    publicAccessEnabled: boolean
    publicAccessBusy: boolean
    actionError: string | null
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
    const [publicAccessTarget, setPublicAccessTarget] = useState<boolean | null>(null)
    const [actionError, setActionError] = useState<string | null>(null)
    const tauriRuntimeAvailable = isTauriRuntimeAvailable()
    const publicAccessBusy = publicAccessTarget !== null
    // While a switch is pending, show the user's target. The settings write and the Hub
    // hot-reload land in two separate snapshots, so a post-write snapshot is briefly
    // stale; the target keeps the UI stable until the watch stream converges.
    const publicAccessEnabled = publicAccessTarget ?? (snapshot ? resolvePublicAccessEnabled(snapshot) : true)

    const applySnapshot = useCallback(
        (nextSnapshot: HubSnapshot) => {
            applyHubSnapshot(nextSnapshot, {
                setSnapshot,
                setActionError,
            })
        },
        [setActionError, setSnapshot]
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
                    applySnapshot(nextSnapshot)
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

    useEffect(() => {
        if (publicAccessTarget === null) return
        if (snapshot?.status?.phase === 'ready' && resolvePublicAccessEnabled(snapshot) === publicAccessTarget) {
            setPublicAccessTarget(null)
        }
        if (snapshot?.running === false || snapshot?.status?.phase === 'error') {
            setPublicAccessTarget(null)
        }
    }, [publicAccessTarget, snapshot])

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
            if (!tauriRuntimeAvailable) {
                setActionError(DESKTOP_PREVIEW_MESSAGE)
                return
            }

            // Optimistic target only. The returned snapshot is captured right after the
            // settings write but before the Hub hot-reload, so it is stale and must not
            // be applied. Convergence is driven solely by the snapshot watch stream.
            setPublicAccessTarget(value)
            setActionError(null)
            try {
                await persistPublicAccessEnabled(value)
            } catch (error) {
                setPublicAccessTarget(null)
                setActionError(describeDesktopError(error, '切换公网访问失败。'))
            }
        },
        [tauriRuntimeAvailable]
    )

    const start = useCallback(async (): Promise<void> => {
        setHubBusy(true)
        setHubAction('start')
        try {
            await runAction(() => startHub())
        } finally {
            setHubBusy(false)
            setHubAction(null)
        }
    }, [runAction])

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
        publicAccessEnabled,
        publicAccessBusy,
        actionError,
        setPublicAccessEnabled,
        refresh,
        start,
        stop,
        copyValue,
        openUrl,
    }
}
