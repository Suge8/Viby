import { HistoryIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { SessionAgentBrandIcon } from '@/components/session-list/sessionAgentPresentation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PressableSurface } from '@/components/ui/pressable-surface'
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

const RECOVER_LOCAL_VISIBLE_BATCH_SIZE = 24

const RECOVER_LOCAL_DRIVER_OPTIONS: ReadonlyArray<NewSessionChoiceOption<RecoverLocalDriverSelection>> =
    RECOVER_LOCAL_DRIVERS.map((driver) => ({
        value: driver,
        label: getSessionAgentLabel(driver),
        icon: <SessionAgentBrandIcon driver={driver} className="h-5 w-5" />,
    }))

type RecoverLocalPanelProps = {
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
}

type RecoverLocalSessionListProps = Pick<
    RecoverLocalPanelProps,
    'sessions' | 'selectedSessionKey' | 'isDisabled' | 'onSelectSession'
>

function RecoverLocalAgentBadge(props: { driver: string }): React.JSX.Element {
    return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--ds-border-default)] bg-[var(--app-subtle-bg)] px-2.5 py-1 font-medium">
            <SessionAgentBrandIcon driver={props.driver} className="h-3.5 w-3.5" />
            {getSessionAgentLabel(props.driver)}
        </span>
    )
}

function RecoverLocalNotice(props: { children: string; tone?: 'default' | 'danger'; role?: 'alert' | 'status' }) {
    const border = props.tone === 'danger' ? 'border-[var(--ds-border-danger)]' : 'border-[var(--ds-border-default)]'
    const text = props.tone === 'danger' ? 'text-[var(--ds-text-danger)]' : 'text-[var(--ds-text-muted)]'
    return (
        <div
            role={props.role}
            className={`rounded-[var(--ds-radius-lg)] border border-dashed ${border} px-4 py-5 text-sm ${text}`}
        >
            {props.children}
        </div>
    )
}

function RecoverLocalSessionCard(props: {
    session: LocalSessionCatalogEntry
    selected: boolean
    disabled: boolean
    dateFormatter: Intl.DateTimeFormat
    messagesLabel: string
    onSelect: () => void
}) {
    const { session } = props
    const updatedAt = new Date(session.updatedAt)
    return (
        <PressableSurface
            type="button"
            selected={props.selected}
            density="compact"
            className="w-full items-start gap-3 rounded-2xl px-4 py-3"
            onClick={props.onSelect}
            disabled={props.disabled}
            role="radio"
            aria-checked={props.selected}
        >
            <span className="flex min-w-0 flex-1 flex-col items-start gap-2">
                <span className="truncate text-sm font-semibold text-[var(--ds-text-primary)]">{session.title}</span>
                <span className="truncate text-xs text-[var(--ds-text-secondary)]">{session.path}</span>
                <span className="flex flex-wrap gap-2 text-xs text-[var(--ds-text-secondary)]">
                    <RecoverLocalAgentBadge driver={session.driver} />
                    {typeof session.messageCount === 'number' ? (
                        <span className="rounded-full border border-[var(--ds-border-default)] bg-[var(--app-subtle-bg)] px-2.5 py-1 font-medium">
                            {session.messageCount} {props.messagesLabel}
                        </span>
                    ) : null}
                    <time
                        dateTime={updatedAt.toISOString()}
                        className="rounded-full border border-[var(--ds-border-default)] bg-[var(--app-subtle-bg)] px-2.5 py-1 font-medium"
                    >
                        {props.dateFormatter.format(updatedAt)}
                    </time>
                </span>
            </span>
        </PressableSurface>
    )
}

function RecoverLocalSessionList(props: RecoverLocalSessionListProps) {
    const { t, locale } = useTranslation()
    const dateFormatter = useMemo(
        () => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }),
        [locale]
    )
    const [visibleCount, setVisibleCount] = useState(RECOVER_LOCAL_VISIBLE_BATCH_SIZE)
    useEffect(() => {
        setVisibleCount(RECOVER_LOCAL_VISIBLE_BATCH_SIZE)
    }, [props.sessions])

    const visibleSessions = useMemo(() => props.sessions.slice(0, visibleCount), [props.sessions, visibleCount])
    const hiddenCount = props.sessions.length - visibleSessions.length
    const nextCount = Math.min(hiddenCount, RECOVER_LOCAL_VISIBLE_BATCH_SIZE)
    return (
        <div className="space-y-2">
            <div className="px-1 text-xs text-[var(--ds-text-muted)]" aria-live="polite">
                {t('newSession.recover.showing', { shown: visibleSessions.length, total: props.sessions.length })}
            </div>
            <div
                className="ds-recover-local-scroller desktop-scrollbar-stable flex flex-col gap-2 overflow-y-auto overscroll-contain rounded-[var(--ds-radius-lg)] border border-[var(--ds-border-default)] bg-[var(--app-subtle-bg)] p-2"
                role="radiogroup"
                aria-label={t('newSession.recover.results')}
            >
                {visibleSessions.map((session) => {
                    const selectionKey = buildRecoverSelectionKey(session)
                    return (
                        <RecoverLocalSessionCard
                            key={selectionKey}
                            session={session}
                            selected={selectionKey === props.selectedSessionKey}
                            disabled={props.isDisabled}
                            dateFormatter={dateFormatter}
                            messagesLabel={t('newSession.recover.messages')}
                            onSelect={() => props.onSelectSession(selectionKey)}
                        />
                    )
                })}
            </div>
            {hiddenCount > 0 ? (
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    disabled={props.isDisabled}
                    onClick={() =>
                        setVisibleCount((count) =>
                            Math.min(count + RECOVER_LOCAL_VISIBLE_BATCH_SIZE, props.sessions.length)
                        )
                    }
                >
                    {t('newSession.recover.showMore', { count: nextCount })}
                </Button>
            ) : null}
        </div>
    )
}

function RecoverLocalBody(props: RecoverLocalPanelProps) {
    const { t } = useTranslation()
    if (props.error)
        return (
            <RecoverLocalNotice tone="danger" role="alert">
                {props.error}
            </RecoverLocalNotice>
        )
    if (props.driverSelection === RECOVER_LOCAL_DRIVER_SELECTION_NONE) return null
    if (!props.hasDirectory) return <RecoverLocalNotice>{t('newSession.recover.selectDirectory')}</RecoverLocalNotice>
    if (props.isLoading) return <RecoverLocalNotice role="status">{t('newSession.recover.loading')}</RecoverLocalNotice>
    if (props.sessions.length === 0) return <RecoverLocalNotice>{t('newSession.recover.empty')}</RecoverLocalNotice>
    return <RecoverLocalSessionList {...props} />
}

function RecoverLocalUnavailableList(props: { capabilities: LocalSessionCapability[] }) {
    const { t } = useTranslation()
    if (props.capabilities.length === 0) return null

    return (
        <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-[var(--ds-text-muted)]">
                {t('newSession.recover.unavailableTitle')}
            </div>
            {props.capabilities.map((capability) => (
                <div
                    key={capability.driver}
                    className="rounded-[var(--ds-radius-lg)] border border-dashed border-[var(--ds-border-default)] px-4 py-3 text-sm text-[var(--ds-text-muted)]"
                >
                    <RecoverLocalAgentBadge driver={capability.driver} />
                    {capability.reason ? ` — ${capability.reason}` : null}
                </div>
            ))}
        </div>
    )
}

export function RecoverLocalPanel(props: RecoverLocalPanelProps) {
    const { t } = useTranslation()
    const hasDriverSelection = props.driverSelection !== RECOVER_LOCAL_DRIVER_SELECTION_NONE

    return (
        <NewSessionSectionCard
            title={t('newSession.recover.title')}
            description={t('newSession.recover.description')}
            icon={<HistoryIcon className="h-5 w-5" />}
            accent="violet"
        >
            <div className="space-y-3">
                <NewSessionChoiceField
                    ariaLabel={t('newSession.recover.filter.driver')}
                    value={hasDriverSelection ? props.driverSelection : null}
                    options={RECOVER_LOCAL_DRIVER_OPTIONS}
                    placeholder={t('newSession.recover.filter.selectAgent')}
                    disabled={props.isDisabled}
                    onChange={props.onDriverSelectionChange}
                />
                {hasDriverSelection ? (
                    <Input
                        value={props.searchQuery}
                        onChange={(event) => props.onSearchQueryChange(event.target.value)}
                        aria-label={t('newSession.recover.searchLabel')}
                        placeholder={t('newSession.recover.searchPlaceholder')}
                        disabled={props.isDisabled}
                    />
                ) : null}
                <RecoverLocalBody {...props} />
                <RecoverLocalUnavailableList capabilities={props.unavailableCapabilities} />
            </div>
        </NewSessionSectionCard>
    )
}
