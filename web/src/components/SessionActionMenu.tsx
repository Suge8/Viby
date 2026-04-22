import { FeatureEditIcon as EditIcon, FeatureTrashIcon as TrashIcon } from '@/components/featureIcons'
import { StopIcon } from '@/components/icons'
import {
    getAvailableSessionActionIds,
    type SessionActionAvailabilityState,
    type SessionActionId,
} from '@/components/session-list/sessionActionAvailability'
import { FloatingActionMenu } from '@/components/ui/FloatingActionMenu'
import type { FloatingActionMenuAnchorPoint, FloatingActionMenuItem } from '@/components/ui/FloatingActionMenu.contract'
import { useTranslation } from '@/lib/use-translation'

type SessionActionMenuOverlay = {
    isOpen: boolean
    onClose: () => void
    anchorPoint: FloatingActionMenuAnchorPoint
    menuId?: string
}

type SessionActionMenuProps = {
    overlay: SessionActionMenuOverlay
    session: SessionActionAvailabilityState
    onActionSelect: (actionId: SessionActionId) => void
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
    onSelect: (actionId: SessionActionId) => void
): FloatingActionMenuItem {
    return createSessionActionMenuItem({
        id: 'rename',
        label: t('session.action.rename'),
        icon: <EditIcon className={DEFAULT_MENU_ICON_CLASS_NAME} />,
        onSelect: () => onSelect('rename'),
    })
}

function createStopMenuItem(
    t: (key: string, params?: Record<string, string | number>) => string,
    onSelect: (actionId: SessionActionId) => void
): FloatingActionMenuItem {
    return createSessionActionMenuItem({
        id: 'stop',
        label: t('session.action.stop'),
        icon: <StopIcon className={DEFAULT_MENU_ICON_CLASS_NAME} />,
        onSelect: () => onSelect('stop'),
    })
}

function createDeleteMenuItem(
    t: (key: string, params?: Record<string, string | number>) => string,
    onSelect: (actionId: SessionActionId) => void
): FloatingActionMenuItem {
    return createSessionActionMenuItem({
        id: 'delete',
        label: t('session.action.delete'),
        icon: <TrashIcon className={DANGER_MENU_ICON_CLASS_NAME} />,
        onSelect: () => onSelect('delete'),
        tone: 'danger',
    })
}

export function SessionActionMenu(props: SessionActionMenuProps): React.JSX.Element {
    const { t } = useTranslation()
    const { overlay, session, onActionSelect } = props
    const items = getSessionActionMenuItems(session, t, onActionSelect)

    return (
        <FloatingActionMenu
            isOpen={overlay.isOpen}
            onClose={overlay.onClose}
            anchorPoint={overlay.anchorPoint}
            content={{
                heading: t('session.more'),
                items,
                menuId: overlay.menuId,
            }}
        />
    )
}

function getSessionActionMenuItems(
    session: SessionActionAvailabilityState,
    t: (key: string, params?: Record<string, string | number>) => string,
    onActionSelect: (actionId: SessionActionId) => void
): FloatingActionMenuItem[] {
    return getAvailableSessionActionIds(session).map((actionId) => {
        switch (actionId) {
            case 'stop':
                return createStopMenuItem(t, onActionSelect)
            case 'rename':
                return createRenameMenuItem(t, onActionSelect)
            case 'delete':
                return createDeleteMenuItem(t, onActionSelect)
        }
    })
}
