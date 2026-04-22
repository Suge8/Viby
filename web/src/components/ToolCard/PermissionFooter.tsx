import type { ChatToolCall } from '@/chat/types'
import { InlineNotice } from '@/components/InlineNotice'
import { useTranslation } from '@/lib/use-translation'

type PermissionFooterProps = {
    tool: ChatToolCall
}

export function PermissionFooter(props: PermissionFooterProps): React.JSX.Element | null {
    const { t } = useTranslation()
    const permission = props.tool.permission

    if (!permission) {
        return null
    }

    if (permission.status === 'pending') {
        return <div className="mt-2 text-xs text-[var(--app-hint)]">{t('tool.awaitingInputInPanel')}</div>
    }

    if (permission.status !== 'denied' && permission.status !== 'canceled') {
        return null
    }

    if (!permission.reason) {
        return null
    }

    return (
        <div className="mt-2">
            <InlineNotice
                tone={permission.status === 'canceled' ? 'warning' : 'danger'}
                title={permission.status === 'canceled' ? t('tool.canceled') : t('tool.deny')}
                description={permission.reason}
                className="px-2.5 py-2 text-xs shadow-none"
            />
        </div>
    )
}
