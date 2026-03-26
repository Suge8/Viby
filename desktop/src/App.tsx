import { useState, type JSX } from 'react'
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
    { value: 'lan', label: '局域网' }
] as const

const APP_SHELL_CLASS_NAME =
    'bg-background text-text-primary flex min-h-screen items-center justify-center p-4'
const PANEL_CLASS_NAME = 'w-full max-w-2xl rounded-lg border border-border bg-surface-raised'
const CHIP_CLASS_NAME =
    'rounded-full bg-surface-item border border-border px-2 py-1 text-xs font-medium text-text-secondary'
const CONTROL_PANEL_CLASS_NAME =
    'flex flex-wrap items-center justify-between gap-4 rounded-md border border-border bg-background p-3'
const ACTION_PANEL_CLASS_NAME =
    'flex flex-wrap items-center gap-4 rounded-md border border-border bg-background p-3'

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
    const viewState = deriveHubViewState(snapshot)
    const entryPreview = buildEntryPreviewModel(snapshot, entryMode)
    const statusCopy = buildStatusCopy(viewState)
    const footerMessage = buildFooterMessage(actionError, snapshot, viewState, entryPreview)
    const ownershipHint = buildOwnershipHint(viewState)
    const overviewFields = buildOverviewFields({ entryPreview, status, copyValue })
    const detailFields = buildDetailFields({ snapshot, status, copyValue })

    const primaryActionTone: 'primary' | 'secondary' = viewState.managed ? 'secondary' : 'primary'
    const primaryActionLabel = buildPrimaryActionLabel(viewState, busy)

    const handlePrimaryAction = (): void => {
        if (viewState.managed) {
            void stop()
            return
        }

        if (!viewState.running) {
            void start()
        }
    }

    const footerClassName = actionError || snapshot?.lastError
        ? 'text-red-400'
        : 'text-text-secondary'

    return (
        <main className={APP_SHELL_CLASS_NAME}>
            <div className={PANEL_CLASS_NAME}>
                <section className="p-6 sm:p-8 flex flex-col gap-6">
                    <header className="flex justify-between items-start">
                        <div className="flex-grow">
                            <span className="text-sm font-medium text-accent-primary">Viby Desktop</span>
                            <div className="flex items-center gap-3 mt-1">
                                <h1 className="text-2xl font-bold text-text-primary">{statusCopy.title}</h1>
                                <StatusBadge phase={viewState.displayedPhase} running={viewState.running} />
                            </div>
                            <p className="text-text-secondary mt-1">{statusCopy.subtitle}</p>
                        </div>
                        <span className={CHIP_CLASS_NAME}>{statusCopy.chip}</span>
                    </header>

                    <div className={CONTROL_PANEL_CLASS_NAME}>
                        <SegmentedControl
                            onChange={(value) => setActiveTab(value as DesktopTab)}
                            options={TAB_OPTIONS}
                            value={activeTab}
                        />
                        <SegmentedControl
                            disabled={busy || viewState.running}
                            onChange={(nextValue) => setEntryMode(nextValue as DesktopEntryMode)}
                            options={ENTRY_OPTIONS}
                            value={entryMode}
                        />
                    </div>

                    {activeTab === 'overview' ? (
                        <section className="flex flex-col gap-6">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

                            <div className={ACTION_PANEL_CLASS_NAME}>
                                <ActionButton
                                    disabled={busy}
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

                            <div className="text-center">
                                <span className="text-sm font-medium text-text-secondary">{ownershipHint.title}</span>
                                <p className="text-xs text-text-secondary/70 mt-1">{ownershipHint.body}</p>
                            </div>
                        </section>
                    ) : (
                        <section>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                </section>

                <footer className="px-6 sm:px-8 py-4 border-t border-border">
                    <span className={`text-xs transition-colors duration-200 ${footerClassName}`}>
                        {footerMessage}
                    </span>
                </footer>
            </div>
        </main>
    )
}
