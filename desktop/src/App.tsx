import { type JSX, useEffect, useState } from 'react'
import { CodingAgentsPage } from '@/components/CodingAgentsPage'
import { ConnectionPage } from '@/components/ConnectionPage'
import { DesktopLanEntryModal } from '@/components/DesktopLanEntryModal'
import { DesktopPairingModal } from '@/components/DesktopPairingModal'
import { WindowDragRegion } from '@/components/DesktopShellChrome'
import { type DesktopPage, DesktopSidebar } from '@/components/DesktopSidebar'
import { CheckIcon } from '@/components/icons'
import { DesktopMotionProvider, PageTransition, ToastLayer } from '@/components/motion'
import { SettingsPanel } from '@/components/SettingsPanel'
import { useAgentAvailability } from '@/hooks/useAgentAvailability'
import { useDesktopPairings } from '@/hooks/useDesktopPairings'
import { useDesktopToast } from '@/hooks/useDesktopToast'
import { useDesktopUpdates } from '@/hooks/useDesktopUpdates'
import { useDeviceAuthSummary } from '@/hooks/useDeviceAuthSummary'
import { useHubController } from '@/hooks/useHubController'
import { usePairingBridges } from '@/hooks/usePairingBridges'
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
    buildDeviceCount,
    buildHubSwitchModel,
    COPY_FEEDBACK_DURATION_MS,
    PAIRING_SUCCESS_DISMISS_MS,
    shouldPollPairingSnapshot,
} from '@/lib/desktopShellModel'
import { buildDeviceLinkSnapshots } from '@/lib/deviceLinkBadge'
import { getConnectedDevices } from '@/lib/deviceListPresentation'
import { buildEntryPreviewModel } from '@/lib/entryMode'
import { deriveHubViewState } from '@/lib/hubSnapshot'
import { buildLanEntryQrModel } from '@/lib/lanEntryQr'

const IDLE_BRIDGE_STATE_PHASE = 'connecting' as const

export function App(): JSX.Element {
    const hub = useHubController()
    const pairings = useDesktopPairings()
    const [activePage, setActivePage] = useState<DesktopPage>('connection')
    const [themePreference, setThemePreferenceState] = useState<ThemePreference>(() =>
        readThemePreference(globalThis.localStorage)
    )
    const [languagePreference, setLanguagePreferenceState] = useState<LanguagePreference>(() =>
        readLanguagePreference(globalThis.localStorage)
    )
    const [systemTheme, setSystemTheme] = useState(() => getSystemTheme(globalThis.matchMedia?.bind(globalThis)))
    const [systemLanguage] = useState(() => getSystemLanguage(globalThis.navigator?.language))
    const [pairingDraftId, setPairingDraftId] = useState<string | null>(null)
    const [pairingDialogOpen, setPairingDialogOpen] = useState(false)
    const [lanEntryDialogOpen, setLanEntryDialogOpen] = useState(false)
    const { message: toastMessage, tone: toastTone, showToast } = useDesktopToast()
    const updates = useDesktopUpdates()

    const status = hub.snapshot?.status
    const viewState = deriveHubViewState(hub.snapshot)
    const agentAvailability = useAgentAvailability(status, viewState.ready, activePage === 'agents')
    const bridges = usePairingBridges({
        pairings: pairings.pairings,
        status,
        enabled: hub.publicAccessEnabled,
    })
    // `bridges` is a fresh Map per render but Map identity is fine to thread
    // through to the popover; the snapshot projection is cheap enough not to
    // need memoisation here.
    const deviceLinks = buildDeviceLinkSnapshots(bridges)
    const deviceSummary = useDeviceAuthSummary(status, viewState.ready, {
        pairingDeviceIds: pairings.pairingDeviceIds,
        pairingResolved: pairings.resolved,
    })

    const draftPairing = pairingDraftId
        ? (pairings.pairings.find((session) => session.pairing.id === pairingDraftId) ?? null)
        : null
    const draftBridge = draftPairing
        ? (bridges.get(draftPairing.pairing.id) ?? {
              phase: IDLE_BRIDGE_STATE_PHASE,
              message: null,
              pairing: draftPairing.pairing,
              stats: null,
          })
        : { phase: IDLE_BRIDGE_STATE_PHASE, message: null, pairing: null, stats: null }

    const entryPreview = buildEntryPreviewModel(hub.snapshot)
    const switchModel = buildHubSwitchModel({
        action: hub.hubAction,
        busy: hub.hubBusy,
        running: viewState.running,
        ready: viewState.ready,
    })
    const themeMode = resolveThemePreference(themePreference, systemTheme)
    const language = resolveLanguagePreference(languagePreference, systemLanguage)
    const copy = DESKTOP_COPY[language]
    const lanEntryQr = buildLanEntryQrModel({ entryPreview, publicAccessEnabled: hub.publicAccessEnabled })
    const lanEntryQrUrl = lanEntryQr?.url ?? null
    const activeDeviceCount = buildDeviceCount(
        deviceSummary.loaded,
        getConnectedDevices(deviceSummary.devices, deviceLinks).length
    )
    const deviceActionVisible = hub.publicAccessEnabled || Boolean(lanEntryQr)
    const deviceActionLabel = lanEntryQr ? copy.lanEntryQrAction : copy.deviceTitle
    const notice = hub.actionError || pairings.actionError || hub.snapshot?.lastError || null
    const busy = hub.busy || pairings.busy

    useEffect(() => {
        const query = globalThis.matchMedia?.('(prefers-color-scheme: dark)')
        if (!query) return
        const handleChange = (event: MediaQueryListEvent): void => setSystemTheme(event.matches ? 'dark' : 'light')
        query.addEventListener('change', handleChange)
        return () => query.removeEventListener('change', handleChange)
    }, [])

    useEffect(() => {
        if (!lanEntryQrUrl) setLanEntryDialogOpen(false)
    }, [lanEntryQrUrl])

    useEffect(() => {
        if (!hub.publicAccessEnabled) {
            setPairingDialogOpen(false)
            return
        }
        if (!draftPairing) setPairingDialogOpen(false)
    }, [draftPairing, hub.publicAccessEnabled])

    useEffect(() => {
        if (notice) showToast(notice)
    }, [notice, showToast])

    useEffect(() => {
        if (updates.phase !== 'available' || !updates.message) return
        showToast(updates.message)
    }, [showToast, updates.message, updates.phase])

    // Poll only the draft pairing (the one whose QR is on screen waiting for
    // approval). Already-approved pairings rely on their own bridge.
    useEffect(() => {
        if (!hub.publicAccessEnabled || !draftPairing) return
        if (!shouldPollPairingSnapshot(draftPairing, draftBridge.phase, pairingDialogOpen)) return
        let stopped = false
        let timerId: number | null = null
        const targetId = draftPairing.pairing.id
        async function poll(): Promise<void> {
            await pairings.refreshPairing(targetId)
            if (!stopped) timerId = window.setTimeout(() => void poll(), 1000)
        }
        timerId = window.setTimeout(() => void poll(), 1000)
        return () => {
            stopped = true
            if (timerId !== null) window.clearTimeout(timerId)
        }
    }, [draftPairing, draftBridge.phase, hub.publicAccessEnabled, pairingDialogOpen, pairings])

    useEffect(() => {
        if (!pairingDialogOpen || draftBridge.phase !== 'ready') return
        const timeoutId = window.setTimeout(() => setPairingDialogOpen(false), PAIRING_SUCCESS_DISMISS_MS)
        return () => window.clearTimeout(timeoutId)
    }, [draftBridge.phase, pairingDialogOpen])

    const handleHubSwitch = (): void => {
        if (viewState.ready) {
            void hub.stop()
            return
        }
        if (!viewState.running) void hub.start()
    }

    const setThemePreference = (preference: ThemePreference): void => {
        setThemePreferenceState(preference)
        writeThemePreference(globalThis.localStorage, preference)
    }

    const setLanguagePreference = (preference: LanguagePreference): void => {
        setLanguagePreferenceState(preference)
        writeLanguagePreference(globalThis.localStorage, preference)
    }

    /**
     * "Add another device": always creates a brand-new pairing session in the
     * desktop pairings map without touching anything already paired. The old
     * `recreatePairing` flow that deleted the broker session is gone — it was
     * exactly why scanning a second phone kicked off the first one.
     */
    const handlePairingAction = (): void => {
        if (!hub.publicAccessEnabled) {
            if (lanEntryQr) setLanEntryDialogOpen(true)
            return
        }
        if (!viewState.ready) return
        void pairings.createPairing().then((created) => {
            if (!created) return
            setPairingDraftId(created.pairing.id)
            setPairingDialogOpen(true)
        })
    }

    const handleDialogClose = (): void => {
        setPairingDialogOpen(false)
        const draftId = pairingDraftId
        setPairingDraftId(null)
        if (!draftId) return
        const candidate = pairings.pairings.find((session) => session.pairing.id === draftId)
        if (!candidate) return
        if (candidate.pairing.approvalStatus === 'approved') return
        void pairings.cancelDraft(draftId)
    }

    const handleRevokeDevice = async (deviceId: string): Promise<void> => {
        if (deviceId.startsWith('pairing:')) {
            const pairingId = deviceId.slice('pairing:'.length)
            if (pairings.pairingIds.has(pairingId)) {
                // Step 1: broker DELETE (tells the phone to bail immediately) +
                // local storage / state remove + bridge dispose.
                await pairings.deletePairing(pairingId)
            }
        }
        // Step 2: hub-side hard delete so the device row drops from the list
        // even when the deleted pairing was a stale local-only record.
        await deviceSummary.revokeDevice(deviceId)
        showToast('已取消配对', COPY_FEEDBACK_DURATION_MS, 'success')
    }

    const getPairingInviteUrl = async (): Promise<string | null> => {
        if (!viewState.ready || !hub.publicAccessEnabled) return null
        const existingDraft = draftPairing ?? pairings.pairings.find((p) => p.pairing.approvalStatus !== 'approved')
        if (existingDraft) return existingDraft.pairingUrl
        return (await pairings.createPairing())?.pairingUrl ?? null
    }

    const handleCopyPublicEntry = async (): Promise<void> => {
        const url = await getPairingInviteUrl()
        const copied = await hub.copyValue(url ?? undefined, '当前没有可复制的入口。')
        if (copied) showToast(copy.publicEntryCopied, COPY_FEEDBACK_DURATION_MS, 'success')
    }

    const handleCopyPairingCode = async (code: string): Promise<void> => {
        const copied = await hub.copyValue(code, '当前没有可复制的配对码。')
        if (copied) showToast('配对码已复制', COPY_FEEDBACK_DURATION_MS, 'success')
    }

    const pairingBrokerHost = status?.pairingBrokerUrl ? new URL(status.pairingBrokerUrl).hostname : null
    const publicEntry =
        hub.publicAccessEnabled && viewState.ready && pairingBrokerHost
            ? {
                  label: copy.publicEntryLabel,
                  value: pairingBrokerHost,
                  onCopy: () => void handleCopyPublicEntry(),
              }
            : null

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
                                copy={copy}
                                entryPreview={entryPreview}
                                publicEntry={publicEntry}
                                activeDeviceCount={activeDeviceCount}
                                devices={deviceSummary.devices}
                                deviceLinks={deviceLinks}
                                deviceActionLabel={deviceActionLabel}
                                deviceActionVisible={deviceActionVisible}
                                viewState={viewState}
                                onOpenEntry={(url) => void hub.openUrl(url)}
                                onPairingAction={handlePairingAction}
                                onRevokeDevice={handleRevokeDevice}
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
                                onOpenUrl={(url) => void hub.openUrl(url)}
                                onRefresh={agentAvailability.refresh}
                            />
                        ) : null}

                        {activePage === 'settings' ? (
                            <SettingsPanel
                                copy={copy}
                                entryMode={hub.entryMode}
                                entryModeDisabled={busy || viewState.running}
                                entryModeLocked={viewState.running}
                                publicAccessDisabled={busy || viewState.running}
                                publicAccessLocked={viewState.running}
                                publicAccessEnabled={hub.publicAccessEnabled}
                                languagePreference={languagePreference}
                                themePreference={themePreference}
                                onEntryModeChange={hub.setEntryMode}
                                onLanguagePreferenceChange={setLanguagePreference}
                                onPublicAccessChange={(value) => void hub.setPublicAccessEnabled(value)}
                                onOpenUrl={(url) => void hub.openUrl(url)}
                                onThemePreferenceChange={setThemePreference}
                                updates={updates}
                            />
                        ) : null}
                    </PageTransition>
                </section>

                <DesktopPairingModal
                    copy={copy}
                    open={pairingDialogOpen}
                    pairing={draftPairing}
                    pairingBridge={draftBridge}
                    onClose={handleDialogClose}
                    onCopyCode={(code) => void handleCopyPairingCode(code)}
                />
                <DesktopLanEntryModal
                    copy={copy}
                    entry={lanEntryQr}
                    open={lanEntryDialogOpen}
                    onClose={() => setLanEntryDialogOpen(false)}
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
