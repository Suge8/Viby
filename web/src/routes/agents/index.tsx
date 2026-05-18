import { type AgentConfigDriver, type AgentConfigFieldValue, getAgentConfigFields } from '@viby/protocol'
import { m } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { InlineNotice } from '@/components/InlineNotice'
import { AgentConfigIcon } from '@/components/icons'
import { MotionStaggerGroup, MotionStaggerItem } from '@/components/motion/motionPrimitives'
import { RouteScrollArea } from '@/components/RouteScrollArea'
import { SurfaceRouteHeader } from '@/components/SurfaceRouteHeader'
import { Button } from '@/components/ui/button'
import { useRestoreAgentConfig } from '@/hooks/mutations/useRestoreAgentConfig'
import { useSaveAgentConfig } from '@/hooks/mutations/useSaveAgentConfig'
import { useAgentConfig } from '@/hooks/queries/useAgentConfig'
import { useAppGoBack } from '@/hooks/useAppGoBack'
import { useFinalizeBootShell } from '@/hooks/useFinalizeBootShell'
import { useAppContext } from '@/lib/app-context'
import { useNoticeCenter } from '@/lib/notice-center'
import { useTranslation } from '@/lib/use-translation'
import { cn } from '@/lib/utils'
import { SessionRoutePageSurface } from '@/routes/sessions/components/SessionRoutePageSurface'
import { AgentConfigEditor } from './AgentConfigEditor'
import {
    CONFIG_DRIVERS,
    createAgentConfigDraft,
    createAgentConfigPatch,
    DRIVER_LABELS,
    getAgentConfigState,
    updateDraftValue,
} from './agentConfigPageSupport'

function formatAgentPath(path: string | null | undefined): string {
    if (!path) return '...'
    return path.replace(/^\/Users\/[^/]+/, '~')
}

function versionDescription(state: ReturnType<typeof getAgentConfigState>, locale: string, fallback: string): string {
    if (!state?.version) return fallback
    const installed = state.version.installedVersion ?? (locale.startsWith('zh') ? '未安装' : 'not installed')
    const command = state.version.command ? ` (${state.version.command})` : ''
    return locale.startsWith('zh')
        ? `当前 ${installed}，只支持 ${state.version.supportedVersion}${command}。请升级后再保存。`
        : `Current ${installed}; only ${state.version.supportedVersion} is supported${command}. Update before saving.`
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
            addToast({
                tone: 'danger',
                title: t('agents.config.saveFailed'),
                description: error.message,
            })
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
            addToast({
                tone: 'danger',
                title: t('agents.config.restoreFailed'),
                description: error.message,
            })
        },
    })

    const fields = useMemo(() => getAgentConfigFields(selectedDriver), [selectedDriver])
    const savedState = getAgentConfigState(query.data, selectedDriver)
    const selectedDraft = drafts[selectedDriver]
    const selectedPatch = createAgentConfigPatch(fields, selectedDraft, savedState?.values)
    const hasChanges = Object.keys(selectedPatch).length > 0
    const isSaving = saveMutation.isPending && saveMutation.variables?.driver === selectedDriver
    const latestBackup = savedState?.backups?.[0] ?? null
    const isRestoring = restoreMutation.isPending && restoreMutation.variables?.driver === selectedDriver
    const versionBlocked = Boolean(savedState && savedState.version.status !== 'supported')

    function updateField(fieldId: string, value: AgentConfigFieldValue): void {
        setDrafts((current) => updateDraftValue(current, selectedDriver, fieldId, value))
    }

    return (
        <SessionRoutePageSurface>
            <SurfaceRouteHeader
                title={t('agents.config.title')}
                eyebrow={t('agents.config.eyebrow')}
                titleIcon={<AgentConfigIcon className="h-5 w-5 text-[var(--ds-brand)]" />}
                onBack={goBack}
            />
            <RouteScrollArea>
                <MotionStaggerGroup className="flex flex-col gap-3" delay={0.03} stagger={0.06}>
                    <MotionStaggerItem y={14}>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                            {CONFIG_DRIVERS.map((driver) => {
                                const state = getAgentConfigState(query.data, driver)
                                const isSelected = driver === selectedDriver
                                return (
                                    <Button
                                        key={driver}
                                        type="button"
                                        variant={isSelected ? 'secondary' : 'ghost'}
                                        pressStyle="segmented"
                                        onClick={() => setSelectedDriver(driver)}
                                        aria-pressed={isSelected}
                                        className={cn(
                                            'h-auto rounded-[var(--ds-radius-md)] px-3 py-3 text-left',
                                            isSelected &&
                                                'border-[var(--ds-border-strong)] bg-[var(--app-subtle-bg)] shadow-[var(--ds-shadow-soft)]'
                                        )}
                                    >
                                        <span className="block w-full min-w-0">
                                            <span className="block text-sm font-semibold">{DRIVER_LABELS[driver]}</span>
                                            <span className="mt-1 block truncate text-xs font-normal text-[var(--ds-text-muted)]">
                                                {state?.version.status !== 'supported'
                                                    ? t('agents.config.versionBlockedShort')
                                                    : state?.exists
                                                      ? t('agents.config.exists')
                                                      : t('agents.config.newFile')}
                                            </span>
                                        </span>
                                    </Button>
                                )
                            })}
                        </div>
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

                    {versionBlocked ? (
                        <MotionStaggerItem y={14}>
                            <InlineNotice
                                tone="warning"
                                title={t('agents.config.versionUnsupported')}
                                description={versionDescription(savedState, locale, t('agents.config.versionUnknown'))}
                            />
                        </MotionStaggerItem>
                    ) : null}

                    <MotionStaggerItem y={14}>
                        <AgentConfigEditor
                            fields={fields}
                            values={selectedDraft}
                            savedState={savedState}
                            locale={locale}
                            defaultOptionLabel={t('agents.config.systemDefault')}
                            disabled={query.isLoading || isSaving || versionBlocked}
                            onChange={updateField}
                        />
                    </MotionStaggerItem>
                </MotionStaggerGroup>
            </RouteScrollArea>

            <m.div
                initial={{ y: 16, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="border-t border-[var(--ds-border-subtle)] bg-[var(--ds-canvas)] px-4 py-3"
            >
                <div className="mx-auto flex max-w-content flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[var(--ds-text-primary)]">
                            {formatAgentPath(savedState?.path)}
                        </p>
                        <p className="text-xs text-[var(--ds-text-muted)]">{t('agents.config.saveHint')}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                        <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={!latestBackup || isRestoring || !api || versionBlocked}
                            onClick={() =>
                                latestBackup &&
                                restoreMutation.mutate({ driver: selectedDriver, backupPath: latestBackup.path })
                            }
                        >
                            {isRestoring ? t('agents.config.restoring') : t('agents.config.restore')}
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            disabled={!hasChanges || isSaving || !api || versionBlocked}
                            onClick={() =>
                                saveMutation.mutate({
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
