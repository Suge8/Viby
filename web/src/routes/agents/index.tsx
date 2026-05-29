import {
    AGENT_CONFIG_DRIVER_LABELS,
    AGENT_CONFIG_VIEW_DRIVERS,
    type AgentConfigDriver,
    type AgentConfigFieldValue,
    createAgentConfigDraft,
    createAgentConfigPatch,
    formatAgentConfigBackupTime,
    getAgentConfigAdvisory,
    getAgentConfigFields,
    getAgentConfigState,
    toAgentConfigLanguage,
    updateAgentConfigDraftValue,
} from '@viby/protocol'
import { LayoutGroup, m } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { InlineNotice } from '@/components/InlineNotice'
import { AgentConfigIcon } from '@/components/icons'
import { MotionStaggerGroup, MotionStaggerItem, MotionSwap } from '@/components/motion/motionPrimitives'
import { RouteScrollArea } from '@/components/RouteScrollArea'
import { SurfaceRouteHeader } from '@/components/SurfaceRouteHeader'
import { SessionAgentBrandIcon } from '@/components/session-list/sessionAgentPresentation'
import { Button } from '@/components/ui/button'
import { useRestoreAgentConfig } from '@/hooks/mutations/useRestoreAgentConfig'
import { useSaveAgentConfig } from '@/hooks/mutations/useSaveAgentConfig'
import { useAgentConfig } from '@/hooks/queries/useAgentConfig'
import { useAppGoBack } from '@/hooks/useAppGoBack'
import { useFinalizeBootShell } from '@/hooks/useFinalizeBootShell'
import { useAppContext } from '@/lib/app-context'
import { useNoticeCenter } from '@/lib/notice-center'
import { useTranslation } from '@/lib/use-translation'
import { SessionRoutePageSurface } from '@/routes/sessions/components/SessionRoutePageSurface'
import { AgentConfigEditor } from './AgentConfigEditor'

function formatAgentPath(path: string | null | undefined): string {
    if (!path) return '...'
    return path.replace(/^\/Users\/[^/]+/, '~')
}

function buildAdvisoryNotice(
    state: ReturnType<typeof getAgentConfigState>,
    t: (key: string) => string
): { title: string; description: string } | null {
    const advisory = getAgentConfigAdvisory(state)
    if (!advisory) return null
    const installed = advisory.installed ?? t('agents.config.versionNotInstalled')
    if (advisory.kind === 'outdated') {
        return {
            title: t('agents.config.versionOutdatedTitle'),
            description: `${installed} → ${advisory.supportedVersion}`,
        }
    }
    return { title: t('agents.config.versionMissingTitle'), description: advisory.supportedVersion }
}

export default function AgentConfigPage(): React.JSX.Element {
    const { api } = useAppContext()
    const { t, locale } = useTranslation()
    const goBack = useAppGoBack()
    const { addToast } = useNoticeCenter()
    const [selectedDriver, setSelectedDriver] = useState<AgentConfigDriver>('codex')
    const [drafts, setDrafts] = useState(() => createAgentConfigDraft(null))
    useFinalizeBootShell()

    const query = useAgentConfig(api)

    useEffect(() => {
        if (query.data) {
            setDrafts(createAgentConfigDraft(query.data))
        }
    }, [query.data])

    const saveMutation = useSaveAgentConfig(api, {
        onSaved: (response) => {
            setDrafts((current) => ({
                ...current,
                [response.agent.driver]: { ...current[response.agent.driver], ...response.agent.values },
            }))
            addToast({ tone: 'success', title: t('agents.config.saved') })
        },
        onError: (error) => {
            addToast({ tone: 'danger', title: t('agents.config.saveFailed'), description: error.message })
        },
    })
    const restoreMutation = useRestoreAgentConfig(api, {
        onRestored: (response) => {
            setDrafts((current) => ({
                ...current,
                [response.agent.driver]: { ...current[response.agent.driver], ...response.agent.values },
            }))
            addToast({ tone: 'success', title: t('agents.config.restored') })
        },
        onError: (error) => {
            addToast({ tone: 'danger', title: t('agents.config.restoreFailed'), description: error.message })
        },
    })

    const fields = useMemo(() => getAgentConfigFields(selectedDriver), [selectedDriver])
    const savedState = getAgentConfigState(query.data, selectedDriver)
    const selectedDraft = drafts[selectedDriver]
    const selectedPatch = createAgentConfigPatch(fields, selectedDraft, savedState?.values)
    const changedCount = Object.keys(selectedPatch).length
    const hasChanges = changedCount > 0
    const isSaving = saveMutation.isPending && saveMutation.variables?.driver === selectedDriver
    const latestBackup = savedState?.backups?.[0] ?? null
    const isRestoring = restoreMutation.isPending && restoreMutation.variables?.driver === selectedDriver
    const advisory = buildAdvisoryNotice(savedState, t)

    function updateField(fieldId: string, value: AgentConfigFieldValue): void {
        setDrafts((current) => updateAgentConfigDraftValue(current, selectedDriver, fieldId, value))
    }

    return (
        <SessionRoutePageSurface>
            <SurfaceRouteHeader
                title={t('agents.config.title')}
                titleIcon={<AgentConfigIcon className="h-5 w-5" />}
                onBack={goBack}
            />
            <RouteScrollArea>
                <MotionStaggerGroup className="flex flex-col gap-4" delay={0.03} stagger={0.06}>
                    <MotionStaggerItem y={10}>
                        <p className="text-sm leading-6 text-[var(--ds-text-secondary)]">
                            {t('agents.config.subtitle')}
                        </p>
                    </MotionStaggerItem>

                    <MotionStaggerItem y={14}>
                        <LayoutGroup id="web-agent-driver-tabs">
                            <div
                                role="tablist"
                                aria-label={t('agents.config.title')}
                                className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
                            >
                                {AGENT_CONFIG_VIEW_DRIVERS.map((driver) => {
                                    const state = getAgentConfigState(query.data, driver)
                                    const active = driver === selectedDriver
                                    const driverAdvisory = Boolean(state && state.version.status !== 'supported')
                                    const statusLabel = driverAdvisory
                                        ? t('agents.config.advisoryShort')
                                        : state?.exists
                                          ? t('agents.config.exists')
                                          : t('agents.config.newFile')
                                    const statusToneClass = driverAdvisory
                                        ? 'text-[var(--app-badge-warning-text)]'
                                        : state?.exists
                                          ? 'text-[var(--ds-accent-lime)]'
                                          : 'text-[var(--ds-text-muted)]'
                                    return (
                                        <div key={driver} className="relative isolate">
                                            {active ? (
                                                <m.span
                                                    layoutId="web-agent-driver-pill"
                                                    className="absolute inset-0 -z-10 rounded-[var(--ds-radius-md)] bg-[var(--ds-brand-soft)] shadow-[var(--ds-shadow-soft)] ring-1 ring-[var(--ds-border-strong)]"
                                                    transition={{ type: 'spring', stiffness: 480, damping: 38 }}
                                                />
                                            ) : null}
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                pressStyle="segmented"
                                                role="tab"
                                                aria-selected={active}
                                                onClick={() => setSelectedDriver(driver)}
                                                className="h-auto w-full rounded-[var(--ds-radius-md)] bg-transparent px-3 py-3 text-left transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--ds-brand-soft)_60%,transparent)]"
                                            >
                                                <span className="flex w-full min-w-0 items-center gap-3">
                                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--ds-panel-strong)] ring-1 ring-[var(--ds-border-default)]">
                                                        <SessionAgentBrandIcon driver={driver} className="h-5 w-5" />
                                                    </span>
                                                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                                                        <span className="truncate text-sm font-semibold text-[var(--ds-text-primary)]">
                                                            {AGENT_CONFIG_DRIVER_LABELS[driver]}
                                                        </span>
                                                        <span
                                                            className={`inline-flex items-center gap-1.5 truncate text-xs font-medium ${statusToneClass}`}
                                                        >
                                                            <span
                                                                className="h-1.5 w-1.5 rounded-full bg-current"
                                                                aria-hidden="true"
                                                            />
                                                            {statusLabel}
                                                        </span>
                                                    </span>
                                                </span>
                                            </Button>
                                        </div>
                                    )
                                })}
                            </div>
                        </LayoutGroup>
                    </MotionStaggerItem>

                    {query.error ? (
                        <MotionStaggerItem y={14}>
                            <InlineNotice
                                tone="danger"
                                title={t('agents.config.loadFailed')}
                                description={query.error instanceof Error ? query.error.message : String(query.error)}
                            />
                        </MotionStaggerItem>
                    ) : null}

                    {savedState?.error ? (
                        <MotionStaggerItem y={14}>
                            <InlineNotice
                                tone="warning"
                                title={t('agents.config.parseFailed')}
                                description={savedState.error}
                            />
                        </MotionStaggerItem>
                    ) : null}

                    {advisory ? (
                        <MotionStaggerItem y={14}>
                            <span
                                role="status"
                                className="inline-flex w-fit items-center gap-1.5 self-start rounded-full bg-[var(--app-badge-warning-bg)] px-2.5 py-1 text-xs font-semibold text-[var(--app-badge-warning-text)] ring-1 ring-[var(--app-badge-warning-border)]"
                            >
                                <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
                                {advisory.title} · {advisory.description}
                            </span>
                        </MotionStaggerItem>
                    ) : null}

                    <MotionStaggerItem y={14}>
                        <MotionSwap switchKey={selectedDriver}>
                            <AgentConfigEditor
                                fields={fields}
                                values={selectedDraft}
                                savedState={savedState}
                                language={toAgentConfigLanguage(locale)}
                                defaultOptionLabel={t('agents.config.systemDefault')}
                                changedLabel={t('agents.config.fieldChanged')}
                                disabled={query.isLoading || isSaving}
                                onChange={updateField}
                            />
                        </MotionSwap>
                    </MotionStaggerItem>
                </MotionStaggerGroup>
            </RouteScrollArea>

            <m.div
                initial={{ y: 16, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="border-t border-[var(--ds-border-subtle)] bg-[color:color-mix(in_srgb,var(--ds-canvas)_92%,transparent)] px-4 py-3 backdrop-blur"
            >
                <div className="mx-auto flex max-w-content flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-xs text-[var(--ds-text-muted)]">
                            {formatAgentPath(savedState?.path)}
                        </p>
                        <p
                            className={
                                hasChanges
                                    ? 'mt-0.5 text-sm font-semibold text-[var(--ds-brand)]'
                                    : 'mt-0.5 text-sm text-[var(--ds-text-muted)]'
                            }
                        >
                            {hasChanges
                                ? t('agents.config.changesPending', { count: changedCount })
                                : t('agents.config.saveHint')}
                        </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                        <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={!latestBackup || isRestoring || !api}
                            pending={isRestoring}
                            title={
                                latestBackup
                                    ? formatAgentConfigBackupTime(latestBackup.createdAt, toAgentConfigLanguage(locale))
                                    : undefined
                            }
                            onClick={() =>
                                latestBackup &&
                                restoreMutation.mutateAsync({ driver: selectedDriver, backupPath: latestBackup.path })
                            }
                        >
                            {isRestoring
                                ? t('agents.config.restoring')
                                : latestBackup
                                  ? t('agents.config.restorePrevious')
                                  : t('agents.config.restoreEmpty')}
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            disabled={!hasChanges || isSaving || !api}
                            pending={isSaving}
                            onClick={() =>
                                saveMutation.mutateAsync({
                                    driver: selectedDriver,
                                    values: selectedPatch,
                                    expectedExists: savedState?.exists ?? false,
                                    expectedStamp: savedState?.stamp,
                                })
                            }
                        >
                            {isSaving ? t('agents.config.saving') : t('agents.config.save')}
                        </Button>
                    </div>
                </div>
            </m.div>
        </SessionRoutePageSurface>
    )
}
