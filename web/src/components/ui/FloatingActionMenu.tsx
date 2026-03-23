import {
    useCallback,
    useEffect,
    useId,
    useLayoutEffect,
    useRef,
    useState,
    type CSSProperties,
    type ReactNode
} from 'react'
import { Button } from '@/components/ui/button'

export type FloatingActionMenuAnchorPoint = {
    x: number
    y: number
}

export const DEFAULT_FLOATING_ACTION_MENU_ANCHOR_POINT: Readonly<FloatingActionMenuAnchorPoint> = {
    x: 0,
    y: 0
}

type FloatingActionMenuItemTone = 'default' | 'danger'

export type FloatingActionMenuItem = {
    id: string
    label: string
    icon: ReactNode
    onSelect: () => void
    tone?: FloatingActionMenuItemTone
}

type FloatingActionMenuProps = {
    isOpen: boolean
    onClose: () => void
    anchorPoint: FloatingActionMenuAnchorPoint
    heading: string
    items: readonly FloatingActionMenuItem[]
    menuId?: string
}

type MenuPosition = {
    top: number
    left: number
    transformOrigin: string
}

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
        heading,
        items,
        menuId
    } = props
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
        const padding = 8
        const gap = 8
        const spaceBelow = viewportHeight - anchorPoint.y
        const spaceAbove = anchorPoint.y
        const openAbove = spaceBelow < menuRect.height + gap && spaceAbove > spaceBelow

        let top = openAbove ? anchorPoint.y - menuRect.height - gap : anchorPoint.y + gap
        let left = anchorPoint.x - menuRect.width / 2

        top = Math.min(Math.max(top, padding), viewportHeight - menuRect.height - padding)
        left = Math.min(Math.max(left, padding), viewportWidth - menuRect.width - padding)

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

    const baseItemClassName =
        'w-full gap-3 rounded-[var(--ds-radius-md)] px-3 py-3 text-left text-base [&>[data-button-content]]:w-full [&>[data-button-content]]:justify-start'

    return (
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
                        className={getMenuItemClassName(item.tone, baseItemClassName)}
                        onClick={() => {
                            onClose()
                            item.onSelect()
                        }}
                    >
                        {item.icon}
                        {item.label}
                    </Button>
                ))}
            </div>
        </div>
    )
}
