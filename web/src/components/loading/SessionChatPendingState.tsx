import { SkeletonRows } from '@/components/loading/LoadingSkeleton'
import { CHAT_MESSAGE_SKELETON_ROWS } from '@/components/loading/chatSkeletonRows'
import { useTranslation } from '@/lib/use-translation'

export function SessionChatPendingState(props: { testId?: string }): React.JSX.Element {
    const { t } = useTranslation()

    return (
        <div
            className="flex h-full min-h-0 w-full overflow-hidden px-4 pb-4 pt-3"
            data-testid={props.testId}
        >
            <div className="ds-stage-shell mx-auto flex w-full flex-1 min-h-0">
                <div className="flex w-full flex-1 items-start rounded-[var(--ds-radius-xl)] bg-[color:color-mix(in_srgb,var(--ds-panel-strong)_76%,transparent)] px-3 py-4">
                    <SkeletonRows
                        label={t('loading.messages')}
                        rows={CHAT_MESSAGE_SKELETON_ROWS}
                        className="w-full space-y-4"
                    />
                </div>
            </div>
        </div>
    )
}
