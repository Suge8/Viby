import type { JSX } from 'react'
import { ControlPill } from '@/components/ControlPill'
import { EntryModeSwitch } from '@/components/EntryModeSwitch'
import { MetricCard } from '@/components/MetricCard'
import { PairingCard, type PairingCardActions } from '@/components/PairingCard'
import { useHubController } from '@/hooks/useHubController'
import { usePairingBridge } from '@/hooks/usePairingBridge'
import { buildEntryPreviewModel } from '@/lib/entryMode'
import { deriveHubViewState } from '@/lib/hubSnapshot'
import {
    buildDetailFields,
    buildFooterMessage,
    buildOverviewFields,
    buildPrimaryActionLabel,
    buildStatusCopy,
    getEmptyKeyMessage,
} from '@/lib/panelContent'

function getPrimaryCaption(ready: boolean, managed: boolean): string {
    if (ready) {
        return '入口已就绪'
    }

    if (managed) {
        return '正在接管当前会话'
    }

    return '轻触即可进入'
}

function getAuraClassName(ready: boolean, managed: boolean): string {
    if (ready) {
        return 'desktop-aura desktop-aura-ready'
    }

    if (managed) {
        return 'desktop-aura desktop-aura-booting'
    }

    return 'desktop-aura'
}

export function App(): JSX.Element {
    const {
        snapshot,
        busy,
        entryMode,
        actionError,
        pairing,
        setEntryMode,
        start,
        stop,
        openPreferred,
        copyValue,
        createPairing,
        approvePairing,
        recreatePairing,
        clearPairing,
    } = useHubController()

    const status = snapshot?.status
    const pairingBridge = usePairingBridge({ pairing, status })
    const viewState = deriveHubViewState(snapshot)
    const statusCopy = buildStatusCopy(viewState)
    const entryPreview = buildEntryPreviewModel(snapshot, entryMode)
    const footerMessage = buildFooterMessage(actionError, snapshot, viewState, entryPreview)
    const overviewFields = buildOverviewFields({ entryPreview, status, copyValue })
    const detailFields = buildDetailFields({ snapshot, status, copyValue })
    const primaryActionLabel = buildPrimaryActionLabel(viewState, busy)
    const primaryActionTone = viewState.managed ? 'secondary' : 'primary'

    const primaryMetric = overviewFields[0]
    const tokenMetric = overviewFields[1]
    const lastUpdatedMetric = detailFields[3]
    const canOpen = Boolean(viewState.ready && status?.preferredBrowserUrl)
    const canCopyToken = Boolean(status?.cliApiToken)
    const canPair = Boolean(viewState.ready)

    const handlePrimaryAction = (): void => {
        if (viewState.managed) {
            void stop()
            return
        }

        if (!viewState.running) {
            void start()
        }
    }

    const pairingActions: PairingCardActions | null = pairing
        ? {
              onApprove: () => void approvePairing(),
              onClear: () => void clearPairing(),
              onCopyLink: () => void copyValue(pairing.pairingUrl, '当前没有可复制的配对链接。'),
              onRefresh: () => void recreatePairing(),
              onRejectAndRefresh: () => void recreatePairing(),
          }
        : null

    return (
        <main className="desktop-shell">
            <div className={getAuraClassName(viewState.ready, viewState.managed)} aria-hidden="true" />
            <section className="desktop-stage">
                <div className="desktop-panel">
                    <div className="desktop-panel-grid">
                        <section className="desktop-hero">
                            <div className="desktop-status-row">
                                <span className="desktop-brand-mark">Viby Desktop</span>
                                <span className={`desktop-phase-chip ${viewState.ready ? 'is-ready' : ''}`}>
                                    <span className="desktop-phase-dot" />
                                    {statusCopy.chip}
                                </span>
                            </div>

                            <div className="desktop-hero-copy">
                                <p className="desktop-eyebrow">{statusCopy.title}</p>
                                <h1 className="desktop-title">
                                    机器在你身边。
                                    <br />
                                    Hub 也该如此。
                                </h1>
                                <p className="desktop-summary">{statusCopy.subtitle}</p>
                            </div>

                            <div className="desktop-primary-zone">
                                <button
                                    className={`desktop-primary-button ${primaryActionTone === 'primary' ? 'is-primary' : ''}`}
                                    disabled={busy}
                                    onClick={handlePrimaryAction}
                                    type="button"
                                >
                                    <span className="desktop-primary-label">{primaryActionLabel}</span>
                                    <span className="desktop-primary-caption">
                                        {busy ? '处理中' : getPrimaryCaption(viewState.ready, viewState.managed)}
                                    </span>
                                </button>
                                <EntryModeSwitch
                                    disabled={busy || viewState.running}
                                    onChange={setEntryMode}
                                    value={entryMode}
                                />
                            </div>

                            <div className="desktop-dock">
                                <ControlPill
                                    disabled={busy || !canOpen}
                                    label="打开入口"
                                    onClick={() => void openPreferred()}
                                />
                                <ControlPill
                                    disabled={busy || !canCopyToken}
                                    label="复制密钥"
                                    onClick={() => void copyValue(status?.cliApiToken, getEmptyKeyMessage())}
                                />
                                <ControlPill
                                    disabled={busy || !canPair}
                                    label={pairing ? '刷新配对码' : '生成配对码'}
                                    onClick={() => void (pairing ? recreatePairing() : createPairing())}
                                />
                            </div>
                        </section>

                        <section className="desktop-ambient-panel">
                            <div className="desktop-orbit">
                                <div className={`desktop-orbit-core ${viewState.ready ? 'is-ready' : ''}`} />
                                <div className="desktop-orbit-ring desktop-orbit-ring-one" />
                                <div className="desktop-orbit-ring desktop-orbit-ring-two" />
                            </div>
                            <div className="desktop-ambient-copy">
                                <p>单一控制</p>
                                <strong>
                                    {viewState.managed ? '这扇窗在托管当前 Hub。' : '还没启动时只有一个动作。'}
                                </strong>
                                <span>
                                    {viewState.ready
                                        ? '入口、密钥、配对都从同一份 snapshot 生长出来。'
                                        : '没有多余导航，没有学习成本，只有状态变化。'}
                                </span>
                            </div>
                        </section>
                    </div>

                    <section className="desktop-metrics" aria-label="核心信息">
                        <MetricCard
                            actionLabel={primaryMetric.actionLabel}
                            label={primaryMetric.label}
                            mono={primaryMetric.mono}
                            onAction={primaryMetric.onAction}
                            value={primaryMetric.value}
                        />
                        <MetricCard
                            actionLabel={tokenMetric.actionLabel}
                            label={tokenMetric.label}
                            mono={tokenMetric.mono}
                            onAction={tokenMetric.onAction}
                            value={tokenMetric.value}
                        />
                        <MetricCard label="最近更新" value={lastUpdatedMetric?.value ?? '刚刚'} />
                    </section>

                    {pairing && pairingActions ? (
                        <PairingCard
                            actions={pairingActions}
                            busy={busy}
                            bridgeState={pairingBridge}
                            pairing={pairing}
                        />
                    ) : null}

                    <footer className={`desktop-footer ${actionError || snapshot?.lastError ? 'is-error' : ''}`}>
                        <span>{footerMessage}</span>
                    </footer>
                </div>
            </section>
        </main>
    )
}
