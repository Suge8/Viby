import type { ComponentPropsWithoutRef, CSSProperties, ReactNode } from 'react'
import { cn } from '@/lib/utils'

const COLLAPSIBLE_PANEL_OPEN_TRANSLATE_Y = '0px'
const COLLAPSIBLE_PANEL_CLOSED_TRANSLATE_Y = '-6px'

type CollapsiblePanelProps = Omit<ComponentPropsWithoutRef<'div'>, 'children'> & {
    children: ReactNode
    open: boolean
    innerClassName?: string
}

export function CollapsiblePanel(props: CollapsiblePanelProps): React.JSX.Element {
    const {
        children,
        className,
        innerClassName,
        open,
        style,
        ...restProps
    } = props
    const collapsibleStyle = {
        '--ds-collapsible-opacity': open ? 1 : 0,
        '--ds-collapsible-translate-y': open
            ? COLLAPSIBLE_PANEL_OPEN_TRANSLATE_Y
            : COLLAPSIBLE_PANEL_CLOSED_TRANSLATE_Y,
        ...style,
    } as CSSProperties

    return (
        <div
            className={cn('ds-collapsible-panel', open && 'ds-collapsible-panel-open', className)}
            data-state={open ? 'open' : 'closed'}
            aria-hidden={!open}
            inert={open ? undefined : true}
            style={collapsibleStyle}
            {...restProps}
        >
            <div className={cn('ds-collapsible-panel-inner', innerClassName)}>
                {children}
            </div>
        </div>
    )
}
