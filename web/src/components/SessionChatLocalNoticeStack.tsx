import { memo } from 'react'
import type { AppNoticeTone } from '@/components/AppNotice'
import { InlineNotice } from '@/components/InlineNotice'
import { MotionStaggerGroup, MotionStaggerItem } from '@/components/motion/motionPrimitives'
import { Button } from '@/components/ui/button'

export type SessionChatLocalNoticeAction = {
    label: string
    pendingLabel: string
    onPress: () => void
    pending?: boolean
}

export type SessionChatLocalNotice = {
    id: string
    tone?: AppNoticeTone
    title: string
    description?: string
    action?: SessionChatLocalNoticeAction
}

type SessionChatLocalNoticeStackProps = {
    notices: readonly SessionChatLocalNotice[]
}

export const SessionChatLocalNoticeStack = memo(function SessionChatLocalNoticeStack(
    props: SessionChatLocalNoticeStackProps
): React.JSX.Element | null {
    if (props.notices.length === 0) {
        return null
    }

    return (
        <div className="session-chat-local-notice-stack shrink-0 px-3 pb-2">
            <MotionStaggerGroup
                className="mx-auto flex w-full ds-stage-shell flex-col gap-2"
                delay={0.04}
                stagger={0.07}
            >
                {props.notices.map((notice, index) => (
                    <MotionStaggerItem
                        key={notice.id}
                        className="flex items-start gap-2"
                        x={index % 2 === 0 ? -18 : 18}
                        y={0}
                    >
                        <InlineNotice
                            tone={notice.tone ?? 'warning'}
                            title={notice.title}
                            description={notice.description}
                            className="min-w-0 flex-1"
                        />
                        {notice.action ? (
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                className="mt-1 shrink-0"
                                disabled={notice.action.pending}
                                aria-busy={notice.action.pending}
                                onClick={notice.action.onPress}
                            >
                                {notice.action.pending ? notice.action.pendingLabel : notice.action.label}
                            </Button>
                        ) : null}
                    </MotionStaggerItem>
                ))}
            </MotionStaggerGroup>
        </div>
    )
})
