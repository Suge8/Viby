import { useCallback, useMemo, useState, type JSX } from 'react'
import { ActionButton } from '@/components/ActionButton'
import { InfoField } from '@/components/InfoField'
import { SegmentedControl } from '@/components/SegmentedControl'
import { StatusBadge } from '@/components/StatusBadge'
import { useHubController } from '@/hooks/useHubController'
import { buildEntryPreviewModel } from '@/lib/entryMode'
import { deriveHubViewState } from '@/lib/hubSnapshot'
import {
    buildDetailFields,
    buildFooterMessage,
    buildOwnershipHint,
    buildOverviewFields,
    buildPrimaryActionLabel,
    buildStatusCopy,
    getEmptyKeyMessage
} from '@/lib/panelContent'
import type { DesktopEntryMode } from '@/types'

type DesktopTab = 'overview' | 'details'

const TAB_OPTIONS = [
    { value: 'overview', label: '概览' },
    { value: 'details', label: '详情' }
] as const

const ENTRY_OPTIONS = [
    { value: 'local', label: '仅本机' },
    { value: 'lan', label: '局域网' },
    { value: 'relay', label: '中转入口' }
] as const

export function App(): JSX.Element {
    const [activeTab, setActiveTab] = useState<DesktopTab>('overview')
    const {
        snapshot,
        busy,
        entryMode,
        actionError,
        setEntryMode,
        start,
        stop,
        openPreferred,
        copyValue
    } = useHubController()

    const status = snapshot?.status
    const viewState = useMemo(() => deriveHubViewState(snapshot), [snapshot])
    const entryPreview = useMemo(() => buildEntryPreviewModel(snapshot, entryMode), [entryMode, snapshot])
    const statusCopy = useMemo(
        () => buildStatusCopy(viewState, entryPreview.canStart),
        [entryPreview.canStart, viewState]
    )
    const footerMessage = useMemo(
        () => buildFooterMessage(actionError, snapshot, viewState, entryPreview),
        [actionError, entryPreview, snapshot, viewState],
    )
    const ownershipHint = useMemo(() => buildOwnershipHint(viewState), [viewState])
    const overviewFields = useMemo(
        () => buildOverviewFields({ entryPreview, status, copyValue }),
        [copyValue, entryPreview, status],
    )
    const detailFields = useMemo(
        () => buildDetailFields({ snapshot, status, copyValue }),
        [copyValue, snapshot, status],
    )

    const primaryActionTone: 'primary' | 'secondary' = viewState.managed ? 'secondary' : 'primary'
    const primaryActionLabel = useMemo(
        () => buildPrimaryActionLabel(viewState, busy, entryPreview.canStart),
        [busy, entryPreview.canStart, viewState],
    )

    const handlePrimaryAction = useCallback((): void => {
        if (viewState.managed) {
            void stop()
            return
        }

        if (!viewState.running) {
            void start()
        }
    }, [start, stop, viewState.managed, viewState.running])

    const handleEntryModeChange = useCallback((nextValue: string): void => {
        setEntryMode(nextValue as DesktopEntryMode)
    }, [setEntryMode])

    return (
        <main className="app-shell">
            <section className="control-panel">
                <header className="panel-top">
                    <div className="panel-copy">
                        <span className="panel-kicker">Viby Desktop</span>
                        <div className="panel-title-row">
                            <h1>{statusCopy.title}</h1>
                            <StatusBadge phase={viewState.displayedPhase} running={viewState.running} />
                        </div>
                        <p>{statusCopy.subtitle}</p>
                    </div>
                    <span className={`ownership-chip ownership-chip-${statusCopy.chipTone}`}>
                        {statusCopy.chip}
                    </span>
                </header>

                <div className="toolbar-row">
                    <div className="toolbar-group">
                        <span className="toolbar-caption">视图</span>
                        <SegmentedControl
                            onChange={(value) => setActiveTab(value as DesktopTab)}
                            options={TAB_OPTIONS}
                            value={activeTab}
                        />
                    </div>
                    <div className="toolbar-group toolbar-group-right">
                        <span className="toolbar-caption">入口范围</span>
                        <SegmentedControl
                            disabled={busy || viewState.running}
                            onChange={handleEntryModeChange}
                            options={ENTRY_OPTIONS}
                            value={entryMode}
                        />
                    </div>
                </div>

                {activeTab === 'overview' ? (
                    <section className="surface-card">
                        <div className="overview-grid">
                            {overviewFields.map((item) => (
                                <InfoField
                                    actionLabel={item.actionLabel}
                                    key={item.label}
                                    label={item.label}
                                    mono={item.mono}
                                    onAction={item.onAction}
                                    value={item.value}
                                />
                            ))}
                        </div>

                        <div className="action-row">
                            <ActionButton
                                disabled={busy || (!viewState.managed && !entryPreview.canStart)}
                                label={primaryActionLabel}
                                onClick={handlePrimaryAction}
                                tone={primaryActionTone}
                            />
                            <ActionButton
                                disabled={busy || !viewState.ready || !status?.preferredBrowserUrl}
                                label="打开入口"
                                onClick={() => void openPreferred()}
                            />
                            <ActionButton
                                disabled={busy || !status?.cliApiToken}
                                label="复制密钥"
                                onClick={() => void copyValue(status?.cliApiToken, getEmptyKeyMessage())}
                            />
                        </div>

                        <div className="hint-card">
                            <span className="hint-title">{ownershipHint.title}</span>
                            <p>{ownershipHint.body}</p>
                        </div>
                    </section>
                ) : (
                    <section className="surface-card">
                        <div className="detail-grid">
                            {detailFields.map((item) => (
                                <InfoField
                                    actionLabel={item.actionLabel}
                                    key={item.label}
                                    label={item.label}
                                    mono={item.mono}
                                    onAction={item.onAction}
                                    value={item.value}
                                />
                            ))}
                        </div>
                    </section>
                )}

                <footer className={actionError || snapshot?.lastError ? 'footer-note footer-note-error' : 'footer-note'}>
                    <span>{footerMessage}</span>
                </footer>
            </section>
        </main>
    )
}
