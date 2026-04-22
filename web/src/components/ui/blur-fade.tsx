import type { CSSProperties, ReactNode } from 'react'
import { MotionReveal } from '@/components/motion/motionPrimitives'

type BlurFadeProps = {
    children: ReactNode
    className?: string
    duration?: number
    delay?: number
    offset?: number
    style?: CSSProperties
}

export function BlurFade(props: BlurFadeProps): React.JSX.Element {
    const { children, className, duration = 0.34, delay = 0, offset = 10, style } = props

    return (
        <MotionReveal className={className} duration={duration} delay={delay} y={offset * -1} style={style}>
            {children}
        </MotionReveal>
    )
}
