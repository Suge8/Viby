import { BrandIcon } from '@/components/icons'
import { useTranslation } from '@/lib/use-translation'

const REPLYING_DOT_DELAYS_MS = [0, 160, 320] as const

type ReplyingDotProps = {
    delayMs: number
}

function ReplyingDot(props: ReplyingDotProps): React.JSX.Element {
    return (
        <span
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-full bg-current animate-pulse motion-reduce:animate-none"
            style={{ animationDelay: `${props.delayMs}ms` }}
        />
    )
}

export function AssistantReplyingIndicator(): React.JSX.Element {
    const { t } = useTranslation()

    return (
        <div className="flex w-full justify-center py-1.5" role="status" aria-live="polite">
            <div
                data-testid="assistant-replying-indicator"
                className="mx-auto inline-flex max-w-full items-center gap-2.5 rounded-full border border-[color:color-mix(in_srgb,var(--ds-brand)_14%,transparent)] bg-[color:color-mix(in_srgb,var(--ds-brand)_8%,transparent)] px-3.5 py-2 text-sm text-[var(--app-hint)] shadow-[0_10px_24px_rgba(9,15,35,0.06)]"
            >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[color:color-mix(in_srgb,var(--ds-brand)_14%,transparent)] text-[var(--ds-brand)]">
                    <BrandIcon className="h-3.5 w-3.5" />
                </span>
                <span className="truncate font-medium text-[var(--ds-text-primary)]">
                    {t('assistant.responding.title')}
                </span>
                <span className="flex shrink-0 items-center gap-1 text-[var(--ds-brand)]">
                    {REPLYING_DOT_DELAYS_MS.map((delayMs) => (
                        <ReplyingDot key={delayMs} delayMs={delayMs} />
                    ))}
                </span>
            </div>
        </div>
    )
}
