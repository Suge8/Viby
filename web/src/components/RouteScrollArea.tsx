import type { ReactNode } from 'react'
import { ROUTE_SCROLL_AREA_TEST_ID } from '@/lib/sessionUiContracts'
import { cn } from '@/lib/utils'

const ROUTE_SCROLL_AREA_CLASS_NAME = 'desktop-scrollbar-stable flex-1 min-h-0 overflow-y-auto overflow-x-hidden'
const ROUTE_SCROLL_INNER_CLASS_NAME = 'ds-stage-shell flex flex-col px-3 pb-6 pt-2'

type RouteScrollAreaProps = {
    children: ReactNode
    className?: string
    innerClassName?: string
}

export function RouteScrollArea(props: RouteScrollAreaProps): React.JSX.Element {
    return (
        <div data-testid={ROUTE_SCROLL_AREA_TEST_ID} className={cn(ROUTE_SCROLL_AREA_CLASS_NAME, props.className)}>
            <div className={cn(ROUTE_SCROLL_INNER_CLASS_NAME, props.innerClassName)}>{props.children}</div>
        </div>
    )
}
