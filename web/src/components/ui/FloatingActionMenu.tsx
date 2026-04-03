import {
    useCallback,
    useEffect,
    useId,
    useLayoutEffect,
    useRef,
    useState,
    type CSSProperties,
} from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import type {
    FloatingActionMenuAnchorPoint,
    FloatingActionMenuContent,
    FloatingActionMenuItem,
    FloatingActionMenuItemTone
} from '@/components/ui/FloatingActionMenu.contract'

type FloatingActionMenuProps = {
    isOpen: boolean
    onClose: () => void
    anchorPoint: FloatingActionMenuAnchorPoint
    content: FloatingActionMenuContent
}

type MenuPosition = {
    top: number
    left: number
    transformOrigin: string
}

const MENU_VIEWPORT_PADDING_PX = 8
const MENU_ANCHOR_GAP_PX = 8
const MENU_ITEM_CLASS_NAME =
    'w-full gap-3 rounded-[var(--ds-radius-md)] px-3 py-3 text-left text-base [&>[data-button-content]]:w-full [&>[data-button-content]]:justify-start'

function buildMenuStyle(menuPosition: MenuPosition | null): CSSProperties | undefined {
    if (!menuPosition) {
        return undefined
    }

    return {
        top: menuPosition.top,
        left: menuPosition.left,
        transformOrigin: menuPosition.transformOrigin
    }
}

function getMenuItemClassName(tone: FloatingActionMenuItemTone | undefined, baseClassName: string): string {
    if (tone === 'danger') {
        return `${baseClassName} text-[var(--ds-danger)] hover:bg-[var(--ds-danger-soft)]`
    }

    return `${baseClassName} hover:bg-[var(--app-subtle-bg)]`
}

export function FloatingActionMenu(props: FloatingActionMenuProps): React.JSX.Element | null {
    const {
        isOpen,
        onClose,
        anchorPoint,
        content
    } = props
    const { heading, items, menuId } = content
    const menuRef = useRef<HTMLDivElement | null>(null)
    const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null)
    const internalId = useId()
    const resolvedMenuId = menuId ?? `floating-action-menu-${internalId}`
    const headingId = `${resolvedMenuId}-heading`

    const updatePosition = useCallback(() => {
        const menuElement = menuRef.current
        if (!menuElement) {
            return
        }

        const menuRect = menuElement.getBoundingClientRect()
        const viewportWidth = window.innerWidth
        const viewportHeight = window.innerHeight
        const spaceBelow = viewportHeight - anchorPoint.y
        const spaceAbove = anchorPoint.y
        const openAbove =
            spaceBelow < menuRect.height + MENU_ANCHOR_GAP_PX && spaceAbove > spaceBelow

        let top = openAbove
            ? anchorPoint.y - menuRect.height - MENU_ANCHOR_GAP_PX
            : anchorPoint.y + MENU_ANCHOR_GAP_PX
        let left = anchorPoint.x - menuRect.width / 2

        top = Math.min(
            Math.max(top, MENU_VIEWPORT_PADDING_PX),
            viewportHeight - menuRect.height - MENU_VIEWPORT_PADDING_PX
        )
        left = Math.min(
            Math.max(left, MENU_VIEWPORT_PADDING_PX),
            viewportWidth - menuRect.width - MENU_VIEWPORT_PADDING_PX
        )

        setMenuPosition({
            top,
            left,
            transformOrigin: openAbove ? 'bottom center' : 'top center'
        })
    }, [anchorPoint])

    useLayoutEffect(() => {
        if (!isOpen) {
            return
        }

        updatePosition()
    }, [isOpen, updatePosition])

    useEffect(() => {
        if (!isOpen) {
            setMenuPosition(null)
            return
        }

        function handlePointerDown(event: PointerEvent): void {
            const target = event.target as Node
            if (menuRef.current?.contains(target)) {
                return
            }

            onClose()
        }

        function handleKeyDown(event: KeyboardEvent): void {
            if (event.key === 'Escape') {
                onClose()
            }
        }

        function handleReflow(): void {
            updatePosition()
        }

        document.addEventListener('pointerdown', handlePointerDown)
        document.addEventListener('keydown', handleKeyDown)
        window.addEventListener('resize', handleReflow)
        window.addEventListener('scroll', handleReflow, true)

        return () => {
            document.removeEventListener('pointerdown', handlePointerDown)
            document.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('resize', handleReflow)
            window.removeEventListener('scroll', handleReflow, true)
        }
    }, [isOpen, onClose, updatePosition])

    useEffect(() => {
        if (!isOpen) {
            return
        }

        const frame = window.requestAnimationFrame(() => {
            const firstItem = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')
            firstItem?.focus()
        })

        return () => window.cancelAnimationFrame(frame)
    }, [isOpen])

    if (!isOpen || items.length === 0) {
        return null
    }

    return createPortal(
        <div
            ref={menuRef}
            className="ds-dialog-surface fixed z-50 min-w-[220px] rounded-[var(--ds-radius-lg)] p-2 animate-menu-pop"
            style={buildMenuStyle(menuPosition)}
        >
            <div
                id={headingId}
                className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--app-hint)]"
            >
                {heading}
            </div>
            <div
                id={resolvedMenuId}
                role="menu"
                aria-labelledby={headingId}
                className="flex flex-col gap-1"
            >
                {items.map((item) => (
                    <Button
                        key={item.id}
                        type="button"
                        variant="ghost"
                        role="menuitem"
                        className={getMenuItemClassName(item.tone, MENU_ITEM_CLASS_NAME)}
                        onClick={item.onSelect}
                    >
                        {item.icon}
                        {item.label}
                    </Button>
                ))}
            </div>
        </div>,
        document.body
    )
}
