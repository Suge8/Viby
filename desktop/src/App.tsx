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

    const footerClass = actionError || snapshot?.lastError ? 'text-red-400' : 'text-slate-500'

    return (
        <main className="font-sans bg-slate-950 text-slate-300 flex items-center justify-center min-h-screen p-4">
            <div className="w-full max-w-2xl bg-slate-900/80 backdrop-blur-sm border border-slate-800 rounded-xl shadow-2xl shadow-black/20">
                <section className="p-6 sm:p-8">
                    <header className="flex justify-between items-start mb-6">
                        <div className="flex-grow">
                            <span className="text-sm font-medium text-sky-500">Viby Desktop</span>
                            <div className="flex items-center gap-3 mt-1">
                                <h1 className="text-2xl font-bold text-white">{statusCopy.title}</h1>
                                <StatusBadge phase={viewState.displayedPhase} running={viewState.running} />
                            </div>
                            <p className="text-slate-400 mt-1">{statusCopy.subtitle}</p>
                        </div>
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                            statusCopy.chipTone === 'managed'
                                ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                                : 'bg-slate-700/50 text-slate-400 border border-slate-700'
                        }`}>
                            {statusCopy.chip}
                        </span>
                    </header>

                    <div className="flex flex-wrap items-center justify-between gap-4 mb-6 p-4 bg-slate-800/50 rounded-lg border border-slate-800">
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
                        <section className="space-y-6">
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

                            <div className="flex flex-wrap items-center gap-4 p-4 bg-slate-800/50 rounded-lg border border-slate-800">
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
                                <span className="text-sm font-medium text-slate-400">{ownershipHint.title}</span>
                                <p className="text-xs text-slate-500 mt-1">{ownershipHint.body}</p>
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
                
                <footer className="px-6 sm:px-8 py-4 border-t border-slate-800">
                    <span className={`text-xs transition-colors duration-200 ${footerClass}`}>{footerMessage}</span>
                </footer>
            </div>
        </main>
    )
}
