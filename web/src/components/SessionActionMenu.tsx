import type { SessionLifecycleState } from '@/types/api'
import { ArchiveIcon, EditIcon, RefreshIcon, StopIcon, TrashIcon } from '@/components/icons'
import {
    FloatingActionMenu,
    type FloatingActionMenuAnchorPoint,
    type FloatingActionMenuItem
} from '@/components/ui/FloatingActionMenu'
import { useTranslation } from '@/lib/use-translation'

type SessionActionMenuState = {
    lifecycleState: SessionLifecycleState
}

type SessionActionMenuCallbacks = {
    onRename: () => void
    onResume: () => void
    onCloseSession: () => void
    onArchive: () => void
    onUnarchive: () => void
    onDelete: () => void
}

type SessionActionMenuProps = {
    isOpen: boolean
    onClose: () => void
    anchorPoint: FloatingActionMenuAnchorPoint
    session: SessionActionMenuState
    actions: SessionActionMenuCallbacks
    menuId?: string
}

export function SessionActionMenu(props: SessionActionMenuProps): React.JSX.Element | null {
    const { t } = useTranslation()
    const {
        isOpen,
        onClose,
        anchorPoint,
        session,
        actions,
        menuId
    } = props
    const items = getSessionActionMenuItems(
        session.lifecycleState,
        t,
        {
            onArchive: actions.onArchive,
            onCloseSession: actions.onCloseSession,
            onDelete: actions.onDelete,
            onRename: actions.onRename,
            onResume: actions.onResume,
            onUnarchive: actions.onUnarchive
        }
    )

    return (
        <FloatingActionMenu
            isOpen={isOpen}
            onClose={onClose}
            anchorPoint={anchorPoint}
            heading={t('session.more')}
            items={items}
            menuId={menuId}
        />
    )
}

function getSessionActionMenuItems(
    lifecycleState: SessionLifecycleState,
    t: (key: string, params?: Record<string, string | number>) => string,
    handlers: {
        onArchive: () => void
        onCloseSession: () => void
        onDelete: () => void
        onRename: () => void
        onResume: () => void
        onUnarchive: () => void
    }
): FloatingActionMenuItem[] {
    const items: FloatingActionMenuItem[] = [
        {
            id: 'rename',
            label: t('session.action.rename'),
            icon: <EditIcon className="text-[var(--app-hint)]" />,
            onSelect: handlers.onRename
        }
    ]

    if (lifecycleState === 'running') {
        items.push(
            {
                id: 'close',
                label: t('session.action.close'),
                icon: <StopIcon className="text-[var(--app-hint)]" />,
                onSelect: handlers.onCloseSession
            },
            {
                id: 'archive',
                label: t('session.action.archive'),
                icon: <ArchiveIcon className="text-[var(--ds-danger)]" />,
                onSelect: handlers.onArchive,
                tone: 'danger'
            }
        )
        return items
    }

    if (lifecycleState === 'closed') {
        items.push(
            {
                id: 'resume',
                label: t('session.action.resume'),
                icon: <RefreshIcon className="text-[var(--app-hint)]" />,
                onSelect: handlers.onResume
            },
            {
                id: 'archive',
                label: t('session.action.archive'),
                icon: <ArchiveIcon className="text-[var(--ds-danger)]" />,
                onSelect: handlers.onArchive,
                tone: 'danger'
            },
            {
                id: 'delete',
                label: t('session.action.delete'),
                icon: <TrashIcon className="text-[var(--ds-danger)]" />,
                onSelect: handlers.onDelete,
                tone: 'danger'
            }
        )
        return items
    }

    items.push(
        {
            id: 'unarchive',
            label: t('session.action.unarchive'),
            icon: <RefreshIcon className="text-[var(--app-hint)]" />,
            onSelect: handlers.onUnarchive
        },
        {
            id: 'delete',
            label: t('session.action.delete'),
            icon: <TrashIcon className="text-[var(--ds-danger)]" />,
            onSelect: handlers.onDelete,
            tone: 'danger'
        }
    )
    return items
}
