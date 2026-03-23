import type { ComponentPropsWithoutRef, CSSProperties, ReactNode } from 'react'
import { cn } from '@/lib/utils'

type BlurFadeProps = ComponentPropsWithoutRef<'div'> & {
    children: ReactNode
    duration?: number
    delay?: number
    offset?: number
    blur?: string
}

export function BlurFade(props: BlurFadeProps): React.JSX.Element {
    const {
        children,
        className,
        duration = 0.34,
        delay = 0,
        offset = 10,
        blur = '10px',
        style,
        ...restProps
    } = props
    const blurFadeStyle = {
        '--ds-blur-fade-duration': `${duration}s`,
        '--ds-blur-fade-delay': `${delay}s`,
        '--ds-blur-fade-offset': `${offset}px`,
        '--ds-blur-fade-blur': blur,
        ...style
    } as CSSProperties

    return (
        <div
            className={cn('ds-blur-fade-enter', className)}
            style={blurFadeStyle}
            {...restProps}
        >
            {children}
        </div>
    )
}
