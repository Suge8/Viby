import { type JSX, useEffect, useRef, useState } from 'react'
import { ConnectionPage } from '@/components/ConnectionPage'
import { DesktopAgentsPageBridge } from '@/components/DesktopAgentsPageBridge'
import { DesktopPairingModal } from '@/components/DesktopPairingModal'
import { WindowDragRegion } from '@/components/DesktopShellChrome'
import { type DesktopPage, DesktopSidebar } from '@/components/DesktopSidebar'
import { CheckIcon } from '@/components/icons'
import { DesktopMotionProvider, PageTransition, ToastLayer } from '@/components/motion'
import { SettingsPanel } from '@/components/SettingsPanel'
import { useAgentAvailability } from '@/hooks/useAgentAvailability'
import { useAgentConfig } from '@/hooks/useAgentConfig'
import { useDesktopLanPairings } from '@/hooks/useDesktopLanPairings'
import { useDesktopPairings } from '@/hooks/useDesktopPairings'
import { useDesktopToast } from '@/hooks/useDesktopToast'
import { useDesktopUpdates } from '@/hooks/useDesktopUpdates'
import { useDeviceAuthSummary } from '@/hooks/useDeviceAuthSummary'
import { useHubController } from '@/hooks/useHubController'
import { usePairingBridges } from '@/hooks/usePairingBridges'
import { usePairingHostEvents } from '@/hooks/usePairingHostEvents'
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
import { buildHubSwitchModel, COPY_FEEDBACK_DURATION_MS, PAIRING_SUCCESS_DISMISS_MS } from '@/lib/desktopShellModel'
import { buildDeviceLinkSnapshots } from '@/lib/deviceLinkBadge'
import { buildDevicePresentation, getConnectedDevices } from '@/lib/deviceListPresentation'
import { buildEntryPreviewModel } from '@/lib/entryMode'
import { deriveHubViewState } from '@/lib/hubSnapshot'

const IDLE_BRIDGE_STATE_PHASE = 'connecting' as const
export function App(): JSX.Element {
    const hub = useHubController()
    const pairings = useDesktopPairings()
    const lanPairings = useDesktopLanPairings()
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
    const [inviteSource, setInviteSource] = useState<'broker' | 'lan' | null>(null)
    const [pairingDialogOpen, setPairingDialogOpen] = useState(false)
    const [showInviteQr, setShowInviteQr] = useState(true)
    const { message: toastMessage, tone: toastTone, showToast } = useDesktopToast()
    const updates = useDesktopUpdates()

    const status = hub.snapshot?.status
    const viewState = deriveHubViewState(hub.snapshot)
    const lastReadyConnectionSnapshotRef = useRef<typeof hub.snapshot>(null)

    useEffect(() => {
        if (viewState.ready && hub.snapshot) lastReadyConnectionSnapshotRef.current = hub.snapshot
    }, [hub.snapshot, viewState.ready])

    const connectionSnapshot =
        hub.publicAccessBusy && !viewState.ready
            ? (lastReadyConnectionSnapshotRef.current ?? hub.snapshot)
            : hub.snapshot
    const connectionViewState = deriveHubViewState(connectionSnapshot)
    const connectionStatus = connectionSnapshot?.status
    const agentAvailability = useAgentAvailability(status, viewState.ready, activePage === 'agents')
    const agentConfig = useAgentConfig(status, viewState.ready, activePage === 'agents')
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

    const entryPreview = buildEntryPreviewModel(connectionSnapshot)
    const switchModel = buildHubSwitchModel({
        action: hub.hubAction,
        busy: hub.hubBusy,
        running: viewState.running,
        ready: viewState.ready,
    })
    const themeMode = resolveThemePreference(themePreference, systemTheme)
    const language = resolveLanguagePreference(languagePreference, systemLanguage)
    const copy = DESKTOP_COPY[language]
    const devices = buildDevicePresentation(deviceSummary.devices, pairings.pairings, bridges)
    const activeDeviceCount = getConnectedDevices(devices, deviceLinks).length
    const lanDraft = lanPairings.draft
    const lanInviteAvailable = Boolean(entryPreview.openUrl)
    const inviteAvailable = hub.publicAccessEnabled || lanInviteAvailable
    // The active modal binds to whichever source the user opened it with so
    // closing one source and immediately opening the other does not flash:
    // closing fires async `cancelDraft` on the prior source, but the new
    // modal binds to a different `kind` (broker vs lan) and stays stable.
    const activeInvite =
        inviteSource === 'lan' && lanDraft
            ? { kind: 'lan' as const, session: lanDraft }
            : inviteSource === 'broker' && draftPairing
              ? { kind: 'broker' as const, session: draftPairing }
              : null
    const deviceActionVisible = inviteAvailable
    const deviceActionLabel = copy.deviceTitle
    const notice = hub.actionError || pairings.actionError || lanPairings.actionError || hub.snapshot?.lastError || null
    const busy = hub.busy || hub.publicAccessBusy || pairings.busy || lanPairings.busy

    useEffect(() => {
        const query = globalThis.matchMedia?.('(prefers-color-scheme: dark)')
        if (!query) return
        const handleChange = (event: MediaQueryListEvent): void => setSystemTheme(event.matches ? 'dark' : 'light')
        query.addEventListener('change', handleChange)
        return () => query.removeEventListener('change', handleChange)
    }, [])

    useEffect(() => {
        if (!activeInvite) setPairingDialogOpen(false)
    }, [activeInvite])

    usePairingHostEvents({
        pairingId: activeInvite?.session.pairing.id ?? null,
        eventsUrl: activeInvite?.session.eventsUrl ?? null,
        onSnapshot: (snapshot) => {
            if (activeInvite?.kind === 'broker') pairings.applySnapshot(snapshot)
            else if (activeInvite?.kind === 'lan') lanPairings.applySnapshot(snapshot)
        },
    })

    useEffect(() => {
        if (notice) showToast(notice)
    }, [notice, showToast])

    useEffect(() => {
        if (updates.phase !== 'available' || !updates.message) return
        showToast(updates.message)
    }, [showToast, updates.message, updates.phase])

    useEffect(() => {
        if (!pairingDialogOpen || !activeInvite) return
        const paired = activeInvite.session.pairing.approvalStatus === 'approved' || draftBridge.phase === 'ready'
        if (!paired) return
        const timeoutId = window.setTimeout(() => setPairingDialogOpen(false), PAIRING_SUCCESS_DISMISS_MS)
        return () => window.clearTimeout(timeoutId)
    }, [activeInvite, draftBridge.phase, pairingDialogOpen])

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
     * Open the invite modal explicitly bound to a source. QR / public /
     * LAN entry buttons each pass their own source so closing one modal
     * and immediately opening another never collapses onto the
     * just-cancelled draft.
     */
    const openInviteModal = async (params: { withQr: boolean; source: 'broker' | 'lan' }): Promise<void> => {
        if (!viewState.ready) return
        setShowInviteQr(params.withQr)
        setInviteSource(params.source)
        if (params.source === 'broker') {
            const existing = draftPairing ?? pairings.pairings.find((p) => p.pairing.approvalStatus !== 'approved')
            if (existing) {
                setPairingDraftId(existing.pairing.id)
                setPairingDialogOpen(true)
                return
            }
            const created = await pairings.createPairing()
            if (!created) return
            setPairingDraftId(created.pairing.id)
            setPairingDialogOpen(true)
            return
        }
        const lanBaseUrl = entryPreview.openUrl
        if (!lanBaseUrl) return
        if (lanDraft) {
            setPairingDialogOpen(true)
            return
        }
        const created = await lanPairings.createDraft(lanBaseUrl)
        if (created) setPairingDialogOpen(true)
    }

    const handlePairingAction = (): void =>
        void openInviteModal({ withQr: true, source: hub.publicAccessEnabled ? 'broker' : 'lan' })
    const handleOpenBrokerInvite = (): void => void openInviteModal({ withQr: false, source: 'broker' })
    const handleOpenLanInvite = (): void => void openInviteModal({ withQr: false, source: 'lan' })

    const handleDialogClose = (): void => {
        const closingSource = inviteSource
        setPairingDialogOpen(false)
        setInviteSource(null)
        if (closingSource === 'lan') {
            if (lanDraft?.pairing.approvalStatus !== 'approved') void lanPairings.cancelDraft()
            return
        }
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
                await pairings.deletePairing(pairingId)
            }
        }
        await deviceSummary.revokeDevice(deviceId)
        showToast('已取消配对', COPY_FEEDBACK_DURATION_MS, 'success')
    }

    const handleCopyInviteLink = async (url: string): Promise<void> => {
        const copied = await hub.copyValue(url, '当前没有可复制的邀请链接。')
        if (copied) showToast('已复制', COPY_FEEDBACK_DURATION_MS, 'success')
    }

    const handleCopyPairingCode = async (code: string): Promise<void> => {
        const copied = await hub.copyValue(code, '当前没有可复制的配对码。')
        if (copied) showToast('配对码已复制', COPY_FEEDBACK_DURATION_MS, 'success')
    }

    const pairingBrokerHost = connectionStatus?.pairingBrokerUrl
        ? new URL(connectionStatus.pairingBrokerUrl).hostname
        : null
    const accessEntries: { label: string; value: string; source: 'broker' | 'lan' }[] = []
    if (hub.publicAccessEnabled && connectionViewState.ready && pairingBrokerHost) {
        accessEntries.push({ label: copy.publicEntryLabel, value: pairingBrokerHost, source: 'broker' })
    }
    for (const entry of entryPreview.entries) {
        accessEntries.push({ label: entry.label, value: entry.value, source: 'lan' })
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
                                copy={copy}
                                accessEntries={accessEntries}
                                activeDeviceCount={activeDeviceCount}
                                devices={devices}
                                deviceLinks={deviceLinks}
                                publicAccessDisabled={busy}
                                publicAccessBusy={hub.publicAccessBusy}
                                publicAccessEnabled={hub.publicAccessEnabled}
                                deviceActionLabel={deviceActionLabel}
                                deviceActionVisible={deviceActionVisible}
                                viewState={connectionViewState}
                                onOpenBrokerInvite={handleOpenBrokerInvite}
                                onOpenLanInvite={handleOpenLanInvite}
                                onPairingAction={handlePairingAction}
                                onPublicAccessChange={(value) => void hub.setPublicAccessEnabled(value)}
                                onRevokeDevice={handleRevokeDevice}
                            />
                        ) : null}
                        {activePage === 'agents' ? (
                            <DesktopAgentsPageBridge
                                agentAvailability={agentAvailability}
                                agentConfig={agentConfig}
                                copy={copy}
                                language={language}
                                showToast={showToast}
                                onOpenUrl={(url) => void hub.openUrl(url)}
                            />
                        ) : null}
                        {activePage === 'settings' ? (
                            <SettingsPanel
                                copy={copy}
                                languagePreference={languagePreference}
                                themePreference={themePreference}
                                onLanguagePreferenceChange={setLanguagePreference}
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
                    pairing={activeInvite?.session ?? null}
                    pairingBridge={draftBridge}
                    showQr={showInviteQr}
                    onClose={handleDialogClose}
                    onCopyCode={(code) => void handleCopyPairingCode(code)}
                    onCopyLink={(url) => void handleCopyInviteLink(url)}
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
