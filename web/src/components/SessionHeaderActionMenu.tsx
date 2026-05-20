import { FolderOpenIcon, TerminalIcon } from '@/components/icons'
import { FloatingActionMenu } from '@/components/ui/FloatingActionMenu'
import type { FloatingActionMenuAnchorPoint, FloatingActionMenuItem } from '@/components/ui/FloatingActionMenu.contract'
import { useTranslation } from '@/lib/use-translation'

type SessionHeaderNavigation = {
    onViewFiles?: () => unknown
    onViewTerminal?: () => unknown
}

type SessionHeaderActionMenuProps = {
    isOpen: boolean
    onClose: () => void
    anchorPoint: FloatingActionMenuAnchorPoint
    menuId: string
    navigation: SessionHeaderNavigation
}

const HEADER_MENU_ICON_CLASS_NAME = 'text-[var(--app-hint)]'

function isFinallyThenable(value: unknown): value is { finally(onFinally: () => void): unknown } {
    return typeof value === 'object' && value !== null && typeof (value as { finally?: unknown }).finally === 'function'
}

function createHeaderMenuItem(
    onClose: () => void,
    action: {
        id: string
        label: string
        icon: React.JSX.Element
        onSelect?: () => unknown
    }
): FloatingActionMenuItem | null {
    if (!action.onSelect) {
        return null
    }

    return {
        id: action.id,
        label: action.label,
        icon: action.icon,
        onSelect: () => {
            try {
                const result = action.onSelect?.()
                if (isFinallyThenable(result)) {
                    return result.finally(onClose)
                }
                onClose()
                return result
            } catch (error) {
                onClose()
                throw error
            }
        },
    }
}

function buildHeaderMenuItems(
    onClose: () => void,
    navigation: SessionHeaderNavigation,
    t: (key: string) => string
): FloatingActionMenuItem[] {
    return [
        createHeaderMenuItem(onClose, {
            id: 'files',
            label: t('files.title'),
            icon: <FolderOpenIcon className={HEADER_MENU_ICON_CLASS_NAME} />,
            onSelect: navigation.onViewFiles,
        }),
        createHeaderMenuItem(onClose, {
            id: 'terminal',
            label: t('terminal.title'),
            icon: <TerminalIcon className={HEADER_MENU_ICON_CLASS_NAME} />,
            onSelect: navigation.onViewTerminal,
        }),
    ].filter((item): item is FloatingActionMenuItem => item !== null)
}

export default function SessionHeaderActionMenu(props: SessionHeaderActionMenuProps): React.JSX.Element | null {
    const { t } = useTranslation()
    const items = buildHeaderMenuItems(props.onClose, props.navigation, t)

    if (items.length === 0) {
        return null
    }

    return (
        <FloatingActionMenu
            isOpen={props.isOpen}
            onClose={props.onClose}
            anchorPoint={props.anchorPoint}
            content={{
                heading: t('session.more'),
                items,
                menuId: props.menuId,
            }}
        />
    )
}
