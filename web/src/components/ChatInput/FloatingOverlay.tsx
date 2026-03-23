import { memo, ReactNode } from 'react'

interface FloatingOverlayProps {
    children: ReactNode
    maxHeight?: number
    className?: string
}

/**
 * A floating panel container with shadow and rounded corners
 * Used for autocomplete suggestions and settings panels
 */
export const FloatingOverlay = memo(function FloatingOverlay(props: FloatingOverlayProps) {
    const { children, className, maxHeight = 240 } = props

    return (
        <div
            className={`overflow-hidden rounded-[24px] border border-[color:color-mix(in_srgb,var(--ds-border-default)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--ds-panel-strong)_94%,transparent)] shadow-[0_24px_60px_rgba(9,15,35,0.16)] backdrop-blur-xl ${className ?? ''}`}
            style={{ maxHeight }}
        >
            <div className="overflow-y-auto" style={{ maxHeight }}>
                {children}
            </div>
        </div>
    )
})
