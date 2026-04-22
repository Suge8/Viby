import { ConversationIcon, PlusIcon, SettingsIcon, WorkspaceIcon } from '@/components/icons'
import { MotionStaggerGroup, MotionStaggerItem } from '@/components/motion/motionPrimitives'
import { STAGE_BRAND_MARK_NEUTRAL_TONE_CLASS_NAME, StageBrandMark } from '@/components/StageBrandMark'
import { Button } from '@/components/ui/button'
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
    const description = props.hasSessions
        ? t('sessions.empty.selection.description')
        : t('sessions.empty.idle.description')

    return (
        <div className="flex h-full min-h-full flex-1 items-center justify-center px-6 py-10">
            <MotionStaggerGroup
                className="ds-sessions-empty-shell mx-auto flex w-full flex-col items-center text-center"
                delay={0.02}
                stagger={0.08}
            >
                <MotionStaggerItem scaleFrom={0.96} y={12}>
                    <div className="mb-9 flex items-center justify-center gap-3 sm:gap-4">
                        <MotionStaggerItem x={-18} y={0} scaleFrom={0.92}>
                            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[color:color-mix(in_srgb,var(--ds-accent-coral)_14%,transparent)] text-[var(--ds-accent-coral)] sm:h-12 sm:w-12">
                                <WorkspaceIcon className="h-5 w-5 sm:h-5.5 sm:w-5.5" />
                            </span>
                        </MotionStaggerItem>
                        <MotionStaggerItem y={10} scaleFrom={0.9}>
                            <StageBrandMark className={SESSIONS_EMPTY_STATE_BRAND_MARK_CLASS_NAME} />
                        </MotionStaggerItem>
                        <MotionStaggerItem x={18} y={0} scaleFrom={0.92}>
                            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[color:color-mix(in_srgb,var(--ds-accent-gold)_14%,transparent)] text-[var(--ds-accent-gold)] sm:h-12 sm:w-12">
                                <ConversationIcon className="h-5 w-5 sm:h-5.5 sm:w-5.5" />
                            </span>
                        </MotionStaggerItem>
                    </div>
                </MotionStaggerItem>

                <MotionStaggerItem y={14}>
                    <div className="space-y-3">
                        <h2 className="ds-sessions-empty-title font-semibold text-[var(--ds-text-primary)]">{title}</h2>
                        <p className="ds-sessions-empty-description mx-auto text-sm leading-7 text-[var(--ds-text-secondary)]">
                            {description}
                        </p>
                    </div>
                </MotionStaggerItem>

                <MotionStaggerItem y={12}>
                    <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                        <MotionStaggerItem x={-12} y={0} scaleFrom={0.94}>
                            <Button size="lg" onClick={props.onCreate} className="gap-2">
                                <PlusIcon className="h-5 w-5" />
                                {t('sessions.new')}
                            </Button>
                        </MotionStaggerItem>
                        <MotionStaggerItem x={12} y={0} scaleFrom={0.94}>
                            <Button size="lg" variant="secondary" onClick={props.onOpenSettings} className="gap-2">
                                <SettingsIcon className="h-5 w-5 text-[var(--ds-accent-coral)]" />
                                {t('settings.title')}
                            </Button>
                        </MotionStaggerItem>
                    </div>
                </MotionStaggerItem>
            </MotionStaggerGroup>
        </div>
    )
}
