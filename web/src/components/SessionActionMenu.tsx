import type { SessionLifecycleState } from '@/types/api'
import { ArchiveIcon, StopIcon } from '@/components/icons'
import {
    FeatureEditIcon as EditIcon,
    FeatureRefreshIcon as RefreshIcon,
    FeatureTrashIcon as TrashIcon,
} from '@/components/featureIcons'
import { FloatingActionMenu } from '@/components/ui/FloatingActionMenu'
import type {
    FloatingActionMenuAnchorPoint,
    FloatingActionMenuItem
} from '@/components/ui/FloatingActionMenu.contract'
import { useTranslation } from '@/lib/use-translation'

type SessionActionMenuState = {
    lifecycleState: SessionLifecycleState
    resumeAvailable: boolean
}

type SessionActionMenuCallbacks = {
    onRename: () => void
    onResume: () => void
    onCloseSession: () => void
    onArchive: () => void
    onUnarchive: () => void
    onDelete: () => void
}

type SessionActionMenuOverlay = {
    isOpen: boolean
    onClose: () => void
    anchorPoint: FloatingActionMenuAnchorPoint
    menuId?: string
}

type SessionActionMenuProps = {
    overlay: SessionActionMenuOverlay
    session: SessionActionMenuState
    actions: SessionActionMenuCallbacks
}

const DEFAULT_MENU_ICON_CLASS_NAME = 'text-[var(--app-hint)]'
const DANGER_MENU_ICON_CLASS_NAME = 'text-[var(--ds-danger)]'

type SessionActionMenuItemConfig = {
    id: string
    label: string
    icon: React.JSX.Element
    onSelect: () => void
    tone?: FloatingActionMenuItem['tone']
}

function createSessionActionMenuItem(config: SessionActionMenuItemConfig): FloatingActionMenuItem {
    return config
}

function createRenameMenuItem(
    t: (key: string, params?: Record<string, string | number>) => string,
    onSelect: () => void
): FloatingActionMenuItem {
    return createSessionActionMenuItem({
        id: 'rename',
        label: t('session.action.rename'),
        icon: <EditIcon className={DEFAULT_MENU_ICON_CLASS_NAME} />,
        onSelect
    })
}

function createResumeMenuItem(
    t: (key: string, params?: Record<string, string | number>) => string,
    onSelect: () => void
): FloatingActionMenuItem {
    return createSessionActionMenuItem({
        id: 'resume',
        label: t('session.action.resume'),
        icon: <RefreshIcon className={DEFAULT_MENU_ICON_CLASS_NAME} />,
        onSelect
    })
}

function createCloseMenuItem(
    t: (key: string, params?: Record<string, string | number>) => string,
    onSelect: () => void
): FloatingActionMenuItem {
    return createSessionActionMenuItem({
        id: 'close',
        label: t('session.action.close'),
        icon: <StopIcon className={DEFAULT_MENU_ICON_CLASS_NAME} />,
        onSelect
    })
}

function createArchiveMenuItem(
    t: (key: string, params?: Record<string, string | number>) => string,
    onSelect: () => void
): FloatingActionMenuItem {
    return createSessionActionMenuItem({
        id: 'archive',
        label: t('session.action.archive'),
        icon: <ArchiveIcon className={DANGER_MENU_ICON_CLASS_NAME} />,
        onSelect,
        tone: 'danger'
    })
}

function createUnarchiveMenuItem(
    t: (key: string, params?: Record<string, string | number>) => string,
    onSelect: () => void
): FloatingActionMenuItem {
    return createSessionActionMenuItem({
        id: 'unarchive',
        label: t('session.action.unarchive'),
        icon: <RefreshIcon className={DEFAULT_MENU_ICON_CLASS_NAME} />,
        onSelect
    })
}

function createDeleteMenuItem(
    t: (key: string, params?: Record<string, string | number>) => string,
    onSelect: () => void
): FloatingActionMenuItem {
    return createSessionActionMenuItem({
        id: 'delete',
        label: t('session.action.delete'),
        icon: <TrashIcon className={DANGER_MENU_ICON_CLASS_NAME} />,
        onSelect,
        tone: 'danger'
    })
}

export function SessionActionMenu(props: SessionActionMenuProps): React.JSX.Element {
    const { t } = useTranslation()
    const { overlay, session, actions } = props
    const items = getSessionActionMenuItems(session, t, actions)

    return (
        <FloatingActionMenu
            isOpen={overlay.isOpen}
            onClose={overlay.onClose}
            anchorPoint={overlay.anchorPoint}
            content={{
                heading: t('session.more'),
                items,
                menuId: overlay.menuId
            }}
        />
    )
}

function getSessionActionMenuItems(
    session: SessionActionMenuState,
    t: (key: string, params?: Record<string, string | number>) => string,
    handlers: SessionActionMenuCallbacks
): FloatingActionMenuItem[] {
    const renameItems = [createRenameMenuItem(t, handlers.onRename)]

    switch (session.lifecycleState) {
        case 'running':
            return [
                ...renameItems,
                createCloseMenuItem(t, handlers.onCloseSession),
                createArchiveMenuItem(t, handlers.onArchive)
            ]
        case 'closed':
            return [
                ...renameItems,
                ...(session.resumeAvailable ? [createResumeMenuItem(t, handlers.onResume)] : []),
                createArchiveMenuItem(t, handlers.onArchive),
                createDeleteMenuItem(t, handlers.onDelete)
            ]
        case 'archived':
            return [
                ...renameItems,
                createUnarchiveMenuItem(t, handlers.onUnarchive),
                createDeleteMenuItem(t, handlers.onDelete)
            ]
    }
}
