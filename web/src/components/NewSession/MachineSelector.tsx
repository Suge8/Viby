import type { Machine } from '@/types/api'
import { MonitorIcon } from '@/components/icons'
import { useTranslation } from '@/lib/use-translation'
import { NewSessionSectionCard } from './NewSessionSectionCard'

function getMachineTitle(machine: Machine): string {
    if (machine.metadata?.displayName) return machine.metadata.displayName
    if (machine.metadata?.host) return machine.metadata.host
    return machine.id.slice(0, 8)
}

export function MachineSelector(props: {
    machines: Machine[]
    machineId: string | null
    isLoading?: boolean
    isDisabled: boolean
    onChange: (machineId: string) => void
}) {
    const { t } = useTranslation()

    if (!props.isLoading && props.machines.length === 0) {
        return (
            <NewSessionSectionCard
                title={t('newSession.machine.emptyTitle')}
                description={t('newSession.machine.emptyDescription')}
                icon={<MonitorIcon className="h-5 w-5" />}
                accent="coral"
            >
                <p className="text-xs leading-6 text-[var(--ds-text-muted)]">
                    {t('newSession.machine.emptyHint')}
                </p>
            </NewSessionSectionCard>
        )
    }

    return (
        <NewSessionSectionCard
            title={t('newSession.machine')}
            icon={<MonitorIcon className="h-5 w-5" />}
            accent="coral"
        >
            <select
                value={props.machineId ?? ''}
                onChange={(e) => props.onChange(e.target.value)}
                disabled={props.isDisabled}
                className="min-h-[50px] w-full rounded-[18px] border border-[var(--ds-border-default)] bg-[color:color-mix(in_srgb,var(--ds-panel-strong)_96%,transparent)] px-4 py-3 text-sm font-medium text-[var(--ds-text-primary)] outline-none transition-[border-color,box-shadow] focus:border-[var(--ds-border-strong)] focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--ds-accent-coral)_18%,transparent)] disabled:opacity-50"
            >
                {props.isLoading && (
                    <option value="">{t('loading.machines')}</option>
                )}
                {!props.isLoading && props.machines.length === 0 && (
                    <option value="">{t('misc.noMachines')}</option>
                )}
                {props.machines.map((m) => (
                    <option key={m.id} value={m.id}>
                        {getMachineTitle(m)}
                        {m.metadata?.platform ? ` (${m.metadata.platform})` : ''}
                    </option>
                ))}
            </select>
            <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full border border-[var(--ds-border-default)] bg-[var(--ds-panel-strong)] px-3 py-1.5 text-[11px] font-medium text-[var(--ds-text-secondary)]">
                    {t('newSession.machine.onlineCount', { n: props.machines.length })}
                </span>
            </div>
        </NewSessionSectionCard>
    )
}
