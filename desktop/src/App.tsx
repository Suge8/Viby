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
    PAIRING_SUCCESS_DISMISS_MS,
    shouldPollPairingSnapshot,
} from '@/lib/desktopShellModel'
import { buildEntryPreviewModel } from '@/lib/entryMode'
import { deriveHubViewState } from '@/lib/hubSnapshot'
import { buildPairingConnectionSummary } from '@/lib/pairingBridgeSupport'
import { shouldStartPairingBridge } from '@/lib/pairingModalSupport'
import { getEmptyKeyMessage } from '@/lib/panelContent'

export function App(): JSX.Element {
    const {
        snapshot,
        busy,
        hubBusy,
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
    const [pairingSuccessAutoDismissArmed, setPairingSuccessAutoDismissArmed] = useState(false)
    const { message: toastMessage, tone: toastTone, showToast } = useDesktopToast()
    const updates = useDesktopUpdates()

    const status = snapshot?.status
    const viewState = deriveHubViewState(snapshot)
    const agentAvailability = useAgentAvailability(status, viewState.ready)
    const pairingBridge = usePairingBridge({
        pairing: shouldStartPairingBridge(pairing) ? pairing : null,
        status,
    })
    const entryPreview = buildEntryPreviewModel(snapshot)
    const switchModel = buildHubSwitchModel({ busy: hubBusy, running: viewState.running, ready: viewState.ready })
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
        if (!notice) {
            return
        }
        showToast(notice)
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
        const intervalId = window.setInterval(() => {
            void refreshPairing()
        }, 1000)
        return () => window.clearInterval(intervalId)
    }, [pairing, pairingBridge.phase, pairingDialogOpen, refreshPairing])

    usePairingInviteAutoRenew(pairing, pairingDialogOpen, async () => {
        setPairingSuccessAutoDismissArmed(false)
        return await recreatePairing()
    })

    useEffect(() => {
        if (!pairingDialogOpen || pairingBridge.phase !== 'ready') {
            return
        }
        if (!pairingSuccessAutoDismissArmed) {
            return
        }
        const timeoutId = window.setTimeout(() => {
            setPairingDialogOpen(false)
            setPairingSuccessAutoDismissArmed(false)
        }, PAIRING_SUCCESS_DISMISS_MS)
        return () => window.clearTimeout(timeoutId)
    }, [pairingBridge.phase, pairingDialogOpen, pairingSuccessAutoDismissArmed])

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
        if (pairing?.pairing.approvalStatus === 'approved') {
            setPairingSuccessAutoDismissArmed(false)
            return
        }
        if (pairing) {
            setPairingSuccessAutoDismissArmed(false)
            setPairingDialogOpen(true)
            return
        }
        if (viewState.ready) {
            setPairingSuccessAutoDismissArmed(true)
            setPairingDialogRequested(true)
            void createPairing()
        }
    }

    const handleRemovePairing = (): void => {
        const confirmed = globalThis.confirm?.('解除绑定后，这台手机需要重新扫码才能连接。继续？') ?? true
        if (confirmed) {
            setPairingDialogOpen(false)
            void deletePairing()
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
                                onRemovePairing={handleRemovePairing}
                            />
                        ) : null}

                        {activePage === 'agents' ? (
                            <CodingAgentsPage
                                agents={agentAvailability.agents}
                                copy={copy}
                                error={agentAvailability.error}
                                loading={agentAvailability.loading}
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
