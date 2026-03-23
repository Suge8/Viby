import { Button } from '@/components/ui/button'
import { BrandIcon, ConversationIcon, PlusIcon, SettingsIcon, WorkspaceIcon } from '@/components/icons'
import { useTranslation } from '@/lib/use-translation'

type SessionsEmptyStateProps = {
    hasSessions: boolean
    onCreate: () => void
    onOpenSettings: () => void
}

export function SessionsEmptyState(props: SessionsEmptyStateProps) {
    const { t } = useTranslation()

    const title = props.hasSessions ? t('sessions.empty.selection.title') : t('sessions.empty.idle.title')
    const description = props.hasSessions ? t('sessions.empty.selection.description') : t('sessions.empty.idle.description')

    return (
        <div className="flex h-full min-h-full flex-1 items-center justify-center px-6 py-10">
            <div className="mx-auto flex w-full max-w-[560px] flex-col items-center text-center">
                <div className="relative mb-8 flex items-center gap-5">
                    <WorkspaceIcon className="h-12 w-12 text-[var(--ds-accent-coral)]" />
                    <BrandIcon className="ds-stage-empty-icon h-16 w-16 text-[var(--ds-accent-lime)]" />
                    <ConversationIcon className="h-12 w-12 text-[var(--ds-accent-gold)]" />
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
