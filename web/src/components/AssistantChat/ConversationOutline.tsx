import { useCallback, useState } from 'react'
import type { ConversationOutlineItem } from '@/chat/outline'
import { ConversationIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { ICON_ONLY_BUTTON_NEUTRAL_SURFACE_CLASS_NAME } from '@/components/ui/iconButtonStyles'
import { useTranslation } from '@/lib/use-translation'

type ConversationOutlineProps = {
    items: readonly ConversationOutlineItem[]
    onJump: (conversationId: string) => boolean
}

export function ConversationOutline({ items, onJump }: ConversationOutlineProps): React.JSX.Element | null {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)
    const jumpToConversation = useCallback(
        (conversationId: string) => {
            if (onJump(conversationId)) {
                setOpen(false)
            }
        },
        [onJump]
    )

    if (items.length < 2) {
        return null
    }

    return (
        <div className="pointer-events-none absolute right-3 top-3 z-20">
            <div className="pointer-events-auto flex flex-col items-end gap-2">
                <Button
                    type="button"
                    size="iconSm"
                    variant="secondary"
                    className={ICON_ONLY_BUTTON_NEUTRAL_SURFACE_CLASS_NAME}
                    aria-expanded={open}
                    aria-label={t('conversationOutline.toggle')}
                    title={t('conversationOutline.toggle')}
                    onClick={() => setOpen((current) => !current)}
                >
                    <ConversationIcon className="h-4.5 w-4.5" />
                </Button>
                {open ? (
                    <div className="max-h-96 w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-3xl border border-[var(--ds-border-default)] bg-[var(--ds-panel-strong)] p-2 shadow-[var(--ds-shadow-elevated)]">
                        <div className="px-3 py-2 text-xs font-semibold uppercase tracking-widest text-[var(--app-hint)]">
                            {t('conversationOutline.title')}
                        </div>
                        <div className="space-y-1">
                            {items.map((item, index) => (
                                <Button
                                    key={item.conversationId}
                                    type="button"
                                    variant="ghost"
                                    pressStyle="list-row"
                                    className="min-h-0 w-full justify-start rounded-2xl px-3 py-2 text-left text-sm font-medium text-[var(--app-fg)]"
                                    onClick={() => jumpToConversation(item.conversationId)}
                                >
                                    <span className="mr-2 shrink-0 text-xs text-[var(--app-hint)]">{index + 1}</span>
                                    <span className="min-w-0 truncate">{item.title}</span>
                                </Button>
                            ))}
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    )
}
