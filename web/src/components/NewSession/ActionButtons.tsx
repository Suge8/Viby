import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/Spinner'
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
        <div className="sticky bottom-0 z-10 mt-2 flex gap-3 rounded-[28px] border border-[var(--ds-border-default)] bg-[color:color-mix(in_srgb,var(--ds-panel-strong)_88%,transparent)] p-3 shadow-[var(--ds-shadow-floating)] backdrop-blur-xl">
            <Button
                variant="secondary"
                onClick={props.onCancel}
                disabled={props.isDisabled}
                className="flex-1"
            >
                {t('button.cancel')}
            </Button>
            <Button
                onClick={props.onCreate}
                disabled={!props.canCreate}
                aria-busy={props.isPending}
                className="flex-1 gap-2"
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
        </div>
    )
}
