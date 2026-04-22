import { HistoryIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { PressableSurface, PressableSurfaceSelectionIndicator } from '@/components/ui/pressable-surface'
import { getSessionAgentLabel } from '@/lib/sessionAgentLabel'
import { useTranslation } from '@/lib/use-translation'
import type { LocalSessionCapability, LocalSessionCatalogEntry } from '@/types/api'
import { NewSessionChoiceField, type NewSessionChoiceOption } from './NewSessionChoiceField'
import { NewSessionSectionCard } from './NewSessionSectionCard'
import {
    RECOVER_LOCAL_DRIVER_SELECTION_NONE,
    RECOVER_LOCAL_DRIVERS,
    type RecoverLocalDriverSelection,
} from './newSessionModes'
import { buildRecoverSelectionKey } from './recoverLocalSelection'

export function RecoverLocalPanel(props: {
    sessions: LocalSessionCatalogEntry[]
    unavailableCapabilities: LocalSessionCapability[]
    selectedSessionKey: string | null
    searchQuery: string
    driverSelection: RecoverLocalDriverSelection
    isLoading: boolean
    error: string | null
    isDisabled: boolean
    hasDirectory: boolean
    onSearchQueryChange: (value: string) => void
    onDriverSelectionChange: (value: RecoverLocalDriverSelection) => void
    onSelectSession: (sessionKey: string) => void
}) {
    const { t, locale } = useTranslation()
    const driverOptions: ReadonlyArray<NewSessionChoiceOption<RecoverLocalDriverSelection>> = [
        { value: RECOVER_LOCAL_DRIVER_SELECTION_NONE, label: t('newSession.recover.filter.selectAgent') },
        ...RECOVER_LOCAL_DRIVERS.map((driver) => ({
            value: driver,
            label: getSessionAgentLabel(driver),
        })),
    ]

    return (
        <NewSessionSectionCard
            title={t('newSession.recover.title')}
            description={t('newSession.recover.description')}
            icon={<HistoryIcon className="h-5 w-5" />}
            accent="violet"
        >
            <div className="space-y-3">
                <Input
                    value={props.searchQuery}
                    onChange={(event) => props.onSearchQueryChange(event.target.value)}
                    placeholder={t('newSession.recover.searchPlaceholder')}
                    disabled={props.isDisabled}
                />

                <NewSessionChoiceField
                    ariaLabel={t('newSession.recover.filter.driver')}
                    value={props.driverSelection}
                    options={driverOptions}
                    disabled={props.isDisabled}
                    onChange={props.onDriverSelectionChange}
                />

                <div className="space-y-2">
                    {props.error ? (
                        <div className="rounded-[var(--ds-radius-lg)] border border-dashed border-[var(--ds-border-danger)] px-4 py-5 text-sm text-[var(--ds-text-danger)]">
                            {props.error}
                        </div>
                    ) : !props.hasDirectory ? (
                        <div className="rounded-[var(--ds-radius-lg)] border border-dashed border-[var(--ds-border-default)] px-4 py-5 text-sm text-[var(--ds-text-muted)]">
                            {t('newSession.recover.selectDirectory')}
                        </div>
                    ) : props.driverSelection === RECOVER_LOCAL_DRIVER_SELECTION_NONE ? (
                        <div className="rounded-[var(--ds-radius-lg)] border border-dashed border-[var(--ds-border-default)] px-4 py-5 text-sm text-[var(--ds-text-muted)]">
                            {t('newSession.recover.selectAgent')}
                        </div>
                    ) : props.isLoading ? (
                        <div className="rounded-[var(--ds-radius-lg)] border border-dashed border-[var(--ds-border-default)] px-4 py-5 text-sm text-[var(--ds-text-muted)]">
                            {t('newSession.recover.loading')}
                        </div>
                    ) : props.sessions.length === 0 ? (
                        <div className="rounded-[var(--ds-radius-lg)] border border-dashed border-[var(--ds-border-default)] px-4 py-5 text-sm text-[var(--ds-text-muted)]">
                            {t('newSession.recover.empty')}
                        </div>
                    ) : (
                        props.sessions.map((session) => {
                            const selectionKey = buildRecoverSelectionKey(session)
                            const isSelected = selectionKey === props.selectedSessionKey
                            return (
                                <PressableSurface
                                    key={selectionKey}
                                    type="button"
                                    selected={isSelected}
                                    density="compact"
                                    className="w-full items-start gap-3 rounded-2xl px-4 py-3"
                                    onClick={() => props.onSelectSession(selectionKey)}
                                    disabled={props.isDisabled}
                                >
                                    <span className="flex min-w-0 flex-1 flex-col items-start gap-2">
                                        <span className="truncate text-sm font-semibold text-[var(--ds-text-primary)]">
                                            {session.title}
                                        </span>
                                        <span className="truncate text-xs text-[var(--ds-text-secondary)]">
                                            {session.summary ?? session.providerSessionId}
                                        </span>
                                        <span className="truncate text-xs text-[var(--ds-text-secondary)]">
                                            {session.path}
                                        </span>
                                        <span className="flex flex-wrap gap-2 text-xs text-[var(--ds-text-secondary)]">
                                            <span className="rounded-full border border-[var(--ds-border-default)] bg-[var(--app-subtle-bg)] px-2.5 py-1 font-medium">
                                                {getSessionAgentLabel(session.driver)}
                                            </span>
                                            {typeof session.messageCount === 'number' ? (
                                                <span className="rounded-full border border-[var(--ds-border-default)] bg-[var(--app-subtle-bg)] px-2.5 py-1 font-medium">
                                                    {session.messageCount} {t('newSession.recover.messages')}
                                                </span>
                                            ) : null}
                                            <span className="px-0.5">
                                                {new Date(session.updatedAt).toLocaleString(locale)}
                                            </span>
                                        </span>
                                    </span>
                                    <PressableSurfaceSelectionIndicator selected={isSelected} className="mt-0.5" />
                                </PressableSurface>
                            )
                        })
                    )}
                </div>

                {props.unavailableCapabilities.length > 0 ? (
                    <div className="space-y-2">
                        <div className="text-xs font-medium uppercase tracking-wide text-[var(--ds-text-muted)]">
                            {t('newSession.recover.unavailableTitle')}
                        </div>
                        {props.unavailableCapabilities.map((capability) => (
                            <div
                                key={capability.driver}
                                className="rounded-[var(--ds-radius-lg)] border border-dashed border-[var(--ds-border-default)] px-4 py-3 text-sm text-[var(--ds-text-muted)]"
                            >
                                <span className="font-medium text-[var(--ds-text-primary)]">
                                    {getSessionAgentLabel(capability.driver)}
                                </span>
                                {capability.reason ? ` — ${capability.reason}` : null}
                            </div>
                        ))}
                    </div>
                ) : null}
            </div>
        </NewSessionSectionCard>
    )
}
