import { Button } from '@/components/ui/button'
import { ConversationIcon, PlusIcon, SettingsIcon, WorkspaceIcon } from '@/components/icons'
import { StageBrandMark, STAGE_BRAND_MARK_NEUTRAL_TONE_CLASS_NAME } from '@/components/StageBrandMark'
import { useTranslation } from '@/lib/use-translation'

type SessionsEmptyStateProps = {
    hasSessions: boolean
    onCreate: () => void
    onOpenSettings: () => void
}

const SESSIONS_EMPTY_STATE_BRAND_MARK_CLASS_NAME = `ds-stage-empty-icon h-24 w-24 ${STAGE_BRAND_MARK_NEUTRAL_TONE_CLASS_NAME} sm:h-28 sm:w-28`

export function SessionsEmptyState(props: SessionsEmptyStateProps) {
    const { t } = useTranslation()

    const title = props.hasSessions ? t('sessions.empty.selection.title') : t('sessions.empty.idle.title')
    const description = props.hasSessions ? t('sessions.empty.selection.description') : t('sessions.empty.idle.description')

    return (
        <div className="flex h-full min-h-full flex-1 items-center justify-center px-6 py-10">
            <div className="mx-auto flex w-full max-w-[560px] flex-col items-center text-center">
                <div className="mb-9 flex items-center justify-center gap-3 sm:gap-4">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[color:color-mix(in_srgb,var(--ds-accent-coral)_14%,transparent)] text-[var(--ds-accent-coral)] sm:h-12 sm:w-12">
                        <WorkspaceIcon className="h-5 w-5 sm:h-5.5 sm:w-5.5" />
                    </span>
                    <StageBrandMark className={SESSIONS_EMPTY_STATE_BRAND_MARK_CLASS_NAME} />
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[color:color-mix(in_srgb,var(--ds-accent-gold)_14%,transparent)] text-[var(--ds-accent-gold)] sm:h-12 sm:w-12">
                        <ConversationIcon className="h-5 w-5 sm:h-5.5 sm:w-5.5" />
                    </span>
                </div>

                <div className="space-y-3">
                    <h2 className="text-[32px] font-semibold tracking-[-0.06em] text-[var(--ds-text-primary)]">
                        {title}
                    </h2>
                    <p className="mx-auto max-w-[34rem] text-sm leading-7 text-[var(--ds-text-secondary)]">
                        {description}
                    </p>
                </div>

                <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                    <Button size="lg" onClick={props.onCreate} className="gap-2">
                        <PlusIcon className="h-5 w-5" />
                        {t('sessions.new')}
                    </Button>
                    <Button size="lg" variant="secondary" onClick={props.onOpenSettings} className="gap-2">
                        <SettingsIcon className="h-5 w-5 text-[var(--ds-accent-coral)]" />
                        {t('settings.title')}
                    </Button>
                </div>
            </div>
        </div>
    )
}
