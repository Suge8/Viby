import type { ReactNode } from 'react'
import { SESSION_ROUTE_PAGE_SURFACE_TEST_ID } from '@/lib/sessionUiContracts'
import { cn } from '@/lib/utils'

const SESSION_ROUTE_PAGE_SURFACE_CLASS_NAME = 'flex h-full min-h-0 min-w-0 w-full flex-1 flex-col bg-[var(--app-bg)]'

type SessionRoutePageSurfaceProps = {
    children: ReactNode
    className?: string
}

export function SessionRoutePageSurface(props: SessionRoutePageSurfaceProps): ReactNode {
    return (
        <div
            data-testid={SESSION_ROUTE_PAGE_SURFACE_TEST_ID}
            className={cn(SESSION_ROUTE_PAGE_SURFACE_CLASS_NAME, props.className)}
        >
            {props.children}
        </div>
    )
}
