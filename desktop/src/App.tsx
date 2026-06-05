import { type JSX, useEffect, useMemo, useRef, useState } from 'react'
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
import { useDesktopShellPreferences } from '@/hooks/useDesktopShellPreferences'
import { useDesktopToast } from '@/hooks/useDesktopToast'
import { useDesktopUpdates } from '@/hooks/useDesktopUpdates'
import { useDeviceAuthSummary } from '@/hooks/useDeviceAuthSummary'
import { useHubController } from '@/hooks/useHubController'
import { usePairingBridges } from '@/hooks/usePairingBridges'
import {
    buildPairingHostEventTargets,
    type PairingHostEventTarget,
    usePairingHostEvents,
} from '@/hooks/usePairingHostEvents'
import { DESKTOP_COPY } from '@/lib/desktopCopy'
import * as shell from '@/lib/desktopShellModel'
import { buildDeviceLinkSnapshots } from '@/lib/deviceLinkBadge'
import { buildDevicePresentation, getConnectedDevices, getInactivePairingIds } from '@/lib/deviceListPresentation'
import { buildEntryPreviewModel } from '@/lib/entryMode'
import { deriveHubViewState } from '@/lib/hubSnapshot'

const IDLE_BRIDGE_STATE_PHASE = 'connecting' as const

function toPairingHostEventTarget(pairingId: string, eventsUrl: string | undefined): PairingHostEventTarget[] {
    return eventsUrl ? [{ pairingId, eventsUrl }] : []
}

export function App(): JSX.Element {
    const hub = useHubController()
    const pairings = useDesktopPairings()
    const refreshAllPairings = pairings.refreshAll
    const lanPairings = useDesktopLanPairings()
    const [activePage, setActivePage] = useState<DesktopPage>('connection')
    const { language, languagePreference, setLanguagePreference, setThemePreference, themeMode, themePreference } =
        useDesktopShellPreferences()
    const [pairingDraftId, setPairingDraftId] = useState<string | null>(null)
    const [inviteSource, setInviteSource] = useState<'broker' | 'lan' | null>(null)
    const [pairingDialogOpen, setPairingDialogOpen] = useState(false)
    const [completedInviteId, setCompletedInviteId] = useState<string | null>(null)
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
        // Hold bridge startup until stored pairings are validated, so a stale
        // host token can never churn the broker and starve a fresh scan.
        enabled: hub.publicAccessEnabled && pairings.resolved,
        onBridgeReady: pairings.refreshPairing,
        onBridgeRejected: (pairingId) => void pairings.dropRejectedPairing(pairingId),
    })
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
    const switchModel = shell.buildHubSwitchModel({
        action: hub.hubAction,
        busy: hub.hubBusy,
        running: viewState.running,
        ready: viewState.ready,
    })
    const copy = DESKTOP_COPY[language]
    const devices = buildDevicePresentation(deviceSummary.devices, pairings.pairings)
    const activeDeviceCount = getConnectedDevices(devices).length
    const inactivePairingIds = useMemo(() => getInactivePairingIds(pairings.pairings), [pairings.pairings])
    const lanDraft = lanPairings.draft
    const lanInviteAvailable = Boolean(entryPreview.openUrl)
    const inviteAvailable = hub.publicAccessEnabled || lanInviteAvailable
    const activeInvite =
        inviteSource === 'lan' && lanDraft
            ? { kind: 'lan' as const, session: lanDraft }
            : inviteSource === 'broker' && draftPairing
              ? { kind: 'broker' as const, session: draftPairing }
              : null
    const modalBridge =
        completedInviteId && completedInviteId === activeInvite?.session.pairing.id
            ? { ...draftBridge, phase: 'ready' as const }
            : draftBridge
    const brokerEventTargets = useMemo<PairingHostEventTarget[]>(
        () => buildPairingHostEventTargets(pairings.pairings),
        [pairings.pairings]
    )
    const lanEventTargets = useMemo<PairingHostEventTarget[]>(
        () =>
            inviteSource === 'lan' && lanDraft ? toPairingHostEventTarget(lanDraft.pairing.id, lanDraft.eventsUrl) : [],
        [inviteSource, lanDraft]
    )
    const deviceActionVisible = inviteAvailable
    const deviceActionLabel = copy.deviceTitle
    const notice = hub.actionError || pairings.actionError || lanPairings.actionError || hub.snapshot?.lastError || null
    const busy = hub.busy || hub.publicAccessBusy || pairings.busy || lanPairings.busy

    useEffect(() => {
        if (activeInvite) return
        setPairingDialogOpen(false)
        setCompletedInviteId(null)
    }, [activeInvite])

    usePairingHostEvents({
        targets: brokerEventTargets,
        onInactive: pairings.clearPresence,
        onSnapshot: pairings.applySnapshot,
    })
    usePairingHostEvents({
        targets: lanEventTargets,
        onSnapshot: lanPairings.applySnapshot,
    })

    useEffect(() => {
        if (notice) showToast(notice)
    }, [notice, showToast])
    useEffect(() => {
        let refreshing = false
        const refreshPairings = (): void => {
            if (refreshing || document.visibilityState === 'hidden') return
            refreshing = true
            void refreshAllPairings().finally(() => {
                refreshing = false
            })
        }
        window.addEventListener('focus', refreshPairings)
        document.addEventListener('visibilitychange', refreshPairings)
        return () => {
            window.removeEventListener('focus', refreshPairings)
            document.removeEventListener('visibilitychange', refreshPairings)
        }
    }, [refreshAllPairings])
    useEffect(() => {
        if (updates.phase !== 'available' || !updates.message) return
        showToast(updates.message)
    }, [showToast, updates.message, updates.phase])

    useEffect(() => {
        if (!pairingDialogOpen || !activeInvite || completedInviteId) return
        const shouldDismiss = shell.shouldDismissPairingInvite({
            source: activeInvite.kind,
            approved: activeInvite.session.pairing.approvalStatus === 'approved',
            bridgePhase: activeInvite.kind === 'broker' ? draftBridge.phase : null,
        })
        if (shouldDismiss) setCompletedInviteId(activeInvite.session.pairing.id)
    }, [activeInvite, completedInviteId, draftBridge.phase, pairingDialogOpen])

    useEffect(() => {
        if (!pairingDialogOpen || !completedInviteId) return
        const timeoutId = window.setTimeout(() => {
            setPairingDialogOpen(false)
            setPairingDraftId(null)
            setInviteSource(null)
            setCompletedInviteId(null)
        }, shell.PAIRING_SUCCESS_DISMISS_MS)
        return () => window.clearTimeout(timeoutId)
    }, [completedInviteId, pairingDialogOpen])

    const handleHubSwitch = (): void => {
        if (viewState.ready) {
            void hub.stop()
            return
        }
        if (!viewState.running) void hub.start()
    }

    const openInviteModal = async (params: { withQr: boolean; source: 'broker' | 'lan' }): Promise<void> => {
        if (!viewState.ready) return
        setShowInviteQr(params.withQr)
        setCompletedInviteId(null)
        setInviteSource(params.source)
        if (params.source === 'broker') {
            const pendingDraftId = draftPairing?.pairing.approvalStatus === null ? draftPairing.pairing.id : null
            if (pendingDraftId) {
                await pairings.cancelDraft(pendingDraftId)
            }
            const created = await pairings.createPairing()
            if (!created) return
            setPairingDraftId(created.pairing.id)
            setPairingDialogOpen(true)
            return
        }
        const lanBaseUrl = entryPreview.openUrl
        if (!lanBaseUrl) return
        if (lanDraft?.pairing.approvalStatus !== 'approved') {
            await lanPairings.cancelDraft()
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
        setCompletedInviteId(null)
        setInviteSource(null)
        if (closingSource === 'lan') {
            const successLocked = completedInviteId === lanDraft?.pairing.id
            if (!successLocked && lanDraft?.pairing.approvalStatus !== 'approved') void lanPairings.cancelDraft()
            return
        }
        const draftId = pairingDraftId
        setPairingDraftId(null)
        if (!draftId) return
        const candidate = pairings.pairings.find((session) => session.pairing.id === draftId)
        if (!candidate) return
        const shouldCancel = shell.shouldCancelPairingInviteOnClose({
            approved: candidate.pairing.approvalStatus === 'approved',
            bridgePhase: bridges.get(draftId)?.phase ?? null,
            successLocked: completedInviteId === draftId,
        })
        if (!shouldCancel) return
        void pairings.cancelDraft(draftId)
    }

    const handleRevokeDevice = async (deviceId: string): Promise<void> => {
        const pairingId = deviceId.startsWith('pairing:') ? deviceId.slice('pairing:'.length) : null
        if (pairingId && pairings.pairingIds.has(pairingId)) await pairings.deletePairing(pairingId)
        await deviceSummary.revokeDevice(deviceId)
        showToast('已取消配对', shell.COPY_FEEDBACK_DURATION_MS, 'success')
    }

    const handleClearInactivePairings = async (): Promise<void> => {
        const results = await Promise.allSettled(
            inactivePairingIds.map((pairingId) => pairings.deletePairing(pairingId))
        )
        const failed = results.some((result) => result.status === 'rejected' || result.value === false)
        showToast(
            failed ? '部分离线绑定清除失败' : '已清除离线绑定',
            shell.COPY_FEEDBACK_DURATION_MS,
            failed ? 'default' : 'success'
        )
    }

    const handleCopyInviteLink = async (url: string): Promise<void> => {
        const copied = await hub.copyValue(url, '当前没有可复制的邀请链接。')
        if (copied) showToast('已复制', shell.COPY_FEEDBACK_DURATION_MS, 'success')
    }

    const handleCopyPairingCode = async (code: string): Promise<void> => {
        const copied = await hub.copyValue(code, '当前没有可复制的配对码。')
        if (copied) showToast('配对码已复制', shell.COPY_FEEDBACK_DURATION_MS, 'success')
    }

    const pairingBrokerHost = connectionStatus?.pairingBrokerUrl
        ? new URL(connectionStatus.pairingBrokerUrl).hostname
        : null
    const accessEntries = shell.buildAccessEntries({
        brokerHost: pairingBrokerHost,
        brokerReady: hub.publicAccessEnabled && connectionViewState.ready,
        lanEntries: entryPreview.entries,
        publicEntryLabel: copy.publicEntryLabel,
    })

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
                                inactivePairingCount={inactivePairingIds.length}
                                viewState={connectionViewState}
                                onClearInactivePairings={handleClearInactivePairings}
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
                    pairingBridge={modalBridge}
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
