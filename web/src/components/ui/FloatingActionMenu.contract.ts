import type { ReactNode } from 'react'

export type FloatingActionMenuAnchorPoint = {
    x: number
    y: number
}

export const DEFAULT_FLOATING_ACTION_MENU_ANCHOR_POINT: Readonly<FloatingActionMenuAnchorPoint> = {
    x: 0,
    y: 0
}

export type FloatingActionMenuItemTone = 'default' | 'danger'

export type FloatingActionMenuItem = {
    id: string
    label: string
    icon: ReactNode
    onSelect: () => void
    tone?: FloatingActionMenuItemTone
}

export type FloatingActionMenuContent = {
    heading: string
    items: readonly FloatingActionMenuItem[]
    menuId?: string
}
