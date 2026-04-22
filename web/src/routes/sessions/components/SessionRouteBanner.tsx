import type { ReactNode } from 'react'
import type { AppNoticeTone } from '@/components/AppNotice'
import { InlineNotice } from '@/components/InlineNotice'
import { MotionReveal } from '@/components/motion/motionPrimitives'

type SessionRouteBannerTone = 'neutral' | 'info' | 'warning' | 'error'

type SessionRouteBannerProps = {
    children?: ReactNode
    tone?: SessionRouteBannerTone
    title?: ReactNode
    description?: ReactNode
}

function getNoticeTone(tone: SessionRouteBannerTone): AppNoticeTone {
    switch (tone) {
        case 'info':
            return 'info'
        case 'warning':
            return 'warning'
        case 'error':
            return 'danger'
        default:
            return 'default'
    }
}

export function SessionRouteBanner(props: SessionRouteBannerProps): ReactNode {
    const tone = props.tone ?? 'neutral'
    const title = props.title ?? props.children
    const description = props.description

    return (
        <MotionReveal className="mx-auto w-full ds-stage-shell px-3 pt-3" duration={0.3} y={12}>
            <InlineNotice tone={getNoticeTone(tone)} title={title} description={description} />
        </MotionReveal>
    )
}
