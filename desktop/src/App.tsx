import { type JSX, useEffect, useState } from 'react'
import { CodingAgentsPage } from '@/components/CodingAgentsPage'
import { ConnectionPage } from '@/components/ConnectionPage'
import { DesktopPairingModal } from '@/components/DesktopPairingModal'
import { WindowDragRegion } from '@/components/DesktopShellChrome'
import { type DesktopPage, DesktopSidebar } from '@/components/DesktopSidebar'
import { CheckIcon } from '@/components/icons'
import { DesktopMotionProvider, PageTransition, ToastLayer } from '@/components/motion'
import { SettingsPanel } from '@/components/SettingsPanel'
import { useAgentAvailability } from '@/hooks/useAgentAvailability'
import { useDesktopToast } from '@/hooks/useDesktopToast'
import { useDesktopUpdates } from '@/hooks/useDesktopUpdates'
import { useHubController } from '@/hooks/useHubController'
import { usePairingBridge } from '@/hooks/usePairingBridge'
import { usePairingInviteAutoRenew } from '@/hooks/usePairingInviteAutoRenew'
import { DESKTOP_COPY } from '@/lib/desktopCopy'
import {
    getSystemLanguage,
    getSystemTheme,
    type LanguagePreference,
    readLanguagePreference,
    readThemePreference,
    resolveLanguagePreference,
    resolveThemePreference,
    type ThemePreference,
    writeLanguagePreference,
    writeThemePreference,
} from '@/lib/desktopPreferences'
import {
    buildHubSwitchModel,
    COPY_FEEDBACK_DURATION_MS,
    isExpiredUnclaimedPairing,
    PAIRING_SUCCESS_DISMISS_MS,
    shouldPollPairingSnapshot,
} from '@/lib/desktopShellModel'
import { buildEntryPreviewModel } from '@/lib/entryMode'
import { deriveHubViewState } from '@/lib/hubSnapshot'
import { buildPairingConnectionSummary, isStalePairingBridgeState } from '@/lib/pairingBridgeSupport'
import { shouldStartPairingBridge } from '@/lib/pairingModalSupport'
import { getEmptyKeyMessage } from '@/lib/panelContent'

export function App(): JSX.Element {
    const {
        snapshot,
        busy,
        hubBusy,
        hubAction,
        entryMode,
        actionError,
        pairing,
        setEntryMode,
        start,
        stop,
        copyValue,
        openUrl,
        createPairing,
        refreshPairing,
        recreatePairing,
        deletePairing,
    } = useHubController()
    const [activePage, setActivePage] = useState<DesktopPage>('connection')
    const [themePreference, setThemePreferenceState] = useState<ThemePreference>(() =>
        readThemePreference(globalThis.localStorage)
    )
    const [languagePreference, setLanguagePreferenceState] = useState<LanguagePreference>(() =>
        readLanguagePreference(globalThis.localStorage)
    )
    const [systemTheme, setSystemTheme] = useState(() => getSystemTheme(globalThis.matchMedia?.bind(globalThis)))
    const [systemLanguage] = useState(() => getSystemLanguage(globalThis.navigator?.language))
    const [pairingDialogOpen, setPairingDialogOpen] = useState(false)
    const [pairingDialogRequested, setPairingDialogRequested] = useState(false)
    const { message: toastMessage, tone: toastTone, showToast } = useDesktopToast()
    const updates = useDesktopUpdates()

    const status = snapshot?.status
    const viewState = deriveHubViewState(snapshot)
    const agentAvailability = useAgentAvailability(status, viewState.ready, activePage === 'agents')
    const pairingBridge = usePairingBridge({
        pairing: shouldStartPairingBridge(pairing) ? pairing : null,
        status,
    })
    const entryPreview = buildEntryPreviewModel(snapshot)
    const switchModel = buildHubSwitchModel({
        action: hubAction,
        busy: hubBusy,
        running: viewState.running,
        ready: viewState.ready,
    })
    const themeMode = resolveThemePreference(themePreference, systemTheme)
    const language = resolveLanguagePreference(languagePreference, systemLanguage)
    const copy = DESKTOP_COPY[language]
    const pairingConnection = buildPairingConnectionSummary({
        ...pairingBridge,
        pairing: pairingBridge.pairing ?? pairing?.pairing ?? null,
    })
    const canCopyToken = Boolean(status?.cliApiToken)
    const notice = actionError || snapshot?.lastError || null

    useEffect(() => {
        const query = globalThis.matchMedia?.('(prefers-color-scheme: dark)')
        if (!query) {
            return
        }

        const handleChange = (event: MediaQueryListEvent): void => setSystemTheme(event.matches ? 'dark' : 'light')
        query.addEventListener('change', handleChange)
        return () => query.removeEventListener('change', handleChange)
    }, [])

    useEffect(() => {
        if (!pairing) {
            setPairingDialogOpen(false)
            return
        }

        if (pairingDialogRequested) {
            setPairingDialogOpen(true)
            setPairingDialogRequested(false)
        }
    }, [pairing, pairingDialogRequested])

    useEffect(() => {
        if (notice) showToast(notice)
    }, [notice, showToast])

    useEffect(() => {
        if (updates.phase !== 'available' || !updates.message) {
            return
        }
        showToast(updates.message)
    }, [showToast, updates.message, updates.phase])

    useEffect(() => {
        if (!shouldPollPairingSnapshot(pairing, pairingBridge.phase, pairingDialogOpen)) {
            return
        }
        let stopped = false
        let timerId: number | null = null

        async function poll(): Promise<void> {
            await refreshPairing()
            if (!stopped) timerId = window.setTimeout(() => void poll(), 1000)
        }

        timerId = window.setTimeout(() => void poll(), 1000)
        return () => {
            stopped = true
            if (timerId !== null) window.clearTimeout(timerId)
        }
    }, [pairing, pairingBridge.phase, pairingDialogOpen, refreshPairing])

    useEffect(() => {
        if (!pairing || !isStalePairingBridgeState(pairingBridge)) {
            return
        }
        setPairingDialogOpen(false)
        showToast('手机绑定已失效，请重新扫码。')
        void deletePairing()
    }, [deletePairing, pairing, pairingBridge, showToast])

    usePairingInviteAutoRenew(pairing, Boolean(pairing), recreatePairing)

    useEffect(() => {
        if (!pairingDialogOpen || pairingBridge.phase !== 'ready') {
            return
        }
        const timeoutId = window.setTimeout(() => {
            setPairingDialogOpen(false)
        }, PAIRING_SUCCESS_DISMISS_MS)
        return () => window.clearTimeout(timeoutId)
    }, [pairingBridge.phase, pairingDialogOpen])

    const handleHubSwitch = (): void => {
        if (viewState.ready) {
            void stop()
            return
        }
        if (!viewState.running) {
            void start()
        }
    }

    const setThemePreference = (preference: ThemePreference): void => {
        setThemePreferenceState(preference)
        writeThemePreference(globalThis.localStorage, preference)
    }

    const setLanguagePreference = (preference: LanguagePreference): void => {
        setLanguagePreferenceState(preference)
        writeLanguagePreference(globalThis.localStorage, preference)
    }

    const handlePairingAction = (): void => {
        if (pairing) {
            setPairingDialogOpen(true)
            if (isExpiredUnclaimedPairing(pairing)) {
                void recreatePairing()
            }
            return
        }
        if (viewState.ready) {
            setPairingDialogRequested(true)
            void createPairing()
        }
    }

    const handleCopyToken = async (): Promise<void> => {
        const copied = await copyValue(status?.cliApiToken, getEmptyKeyMessage())
        if (copied) {
            showToast(copy.accessKeyCopied, COPY_FEEDBACK_DURATION_MS, 'success')
        }
    }

    return (
        <DesktopMotionProvider>
            <main className="desktop-shell" data-theme={themeMode} lang={language === 'zh' ? 'zh-CN' : 'en'}>
                <WindowDragRegion />
                <DesktopSidebar
                    activePage={activePage}
                    copy={copy}
                    hubReady={viewState.ready}
                    switchModel={switchModel}
                    onHubSwitch={handleHubSwitch}
                    onPageChange={setActivePage}
                />

                <section className="desktop-main" aria-live="polite">
                    <PageTransition transitionKey={activePage}>
                        {activePage === 'connection' ? (
                            <ConnectionPage
                                busy={busy}
                                canCopyToken={canCopyToken}
                                copy={copy}
                                entryPreview={entryPreview}
                                pairingConnection={pairingConnection}
                                viewState={viewState}
                                onCopyToken={() => void handleCopyToken()}
                                onOpenEntry={(url) => void openUrl(url)}
                                onPairingAction={handlePairingAction}
                            />
                        ) : null}

                        {activePage === 'agents' ? (
                            <CodingAgentsPage
                                agents={agentAvailability.agents}
                                capabilities={agentAvailability.capabilities}
                                copy={copy}
                                error={agentAvailability.error}
                                loading={agentAvailability.loading}
                                refreshing={agentAvailability.refreshing}
                                onLoadAgentCapability={agentAvailability.loadAgentCapability}
                                onOpenUrl={(url) => void openUrl(url)}
                                onRefresh={agentAvailability.refresh}
                            />
                        ) : null}

                        {activePage === 'settings' ? (
                            <SettingsPanel
                                copy={copy}
                                entryMode={entryMode}
                                entryModeDisabled={busy || viewState.running}
                                languagePreference={languagePreference}
                                themePreference={themePreference}
                                onEntryModeChange={setEntryMode}
                                onLanguagePreferenceChange={setLanguagePreference}
                                onOpenUrl={(url) => void openUrl(url)}
                                onThemePreferenceChange={setThemePreference}
                                updates={updates}
                            />
                        ) : null}
                    </PageTransition>
                </section>

                <DesktopPairingModal
                    copy={copy}
                    open={pairingDialogOpen}
                    pairing={pairing}
                    pairingBridge={pairingBridge}
                    onClose={() => setPairingDialogOpen(false)}
                />

                <ToastLayer
                    message={toastMessage}
                    className="desktop-toast"
                    tone={toastTone}
                    icon={toastTone === 'success' ? <CheckIcon /> : undefined}
                />
            </main>
        </DesktopMotionProvider>
    )
}
