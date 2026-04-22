import { MotionStaggerGroup, MotionStaggerItem } from '@/components/motion/motionPrimitives'
import { Spinner } from '@/components/Spinner'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/use-translation'

export function ActionButtons(props: {
    isPending: boolean
    canCreate: boolean
    isDisabled: boolean
    createLabel?: string
    onCancel: () => void
    onCreate: () => void
}) {
    const { t } = useTranslation()

    return (
        <div className="ds-new-session-action-bar sticky bottom-0 z-10 mt-2 border border-[var(--ds-border-default)] bg-[color:color-mix(in_srgb,var(--ds-panel-strong)_88%,transparent)] p-3 shadow-[var(--ds-shadow-floating)] backdrop-blur-xl">
            <MotionStaggerGroup className="flex gap-3" delay={0.02} stagger={0.08}>
                <MotionStaggerItem className="flex-1" x={-16} y={0}>
                    <Button variant="secondary" onClick={props.onCancel} disabled={props.isDisabled} className="w-full">
                        {t('button.cancel')}
                    </Button>
                </MotionStaggerItem>
                <MotionStaggerItem className="flex-1" x={16} y={0}>
                    <Button
                        onClick={props.onCreate}
                        disabled={!props.canCreate}
                        aria-busy={props.isPending}
                        className="w-full gap-2"
                    >
                        {props.isPending ? (
                            <>
                                <Spinner size="sm" label={null} className="text-[var(--app-button-text)]" />
                                {t('newSession.creating')}
                            </>
                        ) : (
                            (props.createLabel ?? t('newSession.create'))
                        )}
                    </Button>
                </MotionStaggerItem>
            </MotionStaggerGroup>
        </div>
    )
}
