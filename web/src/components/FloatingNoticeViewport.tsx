import { memo, useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { AppNotice } from '@/components/AppNotice'
import { getNoticeToneIcon } from '@/components/InlineNotice'
import { AnimatedList } from '@/components/ui/animated-list'
import { Button } from '@/components/ui/button'
import { BlurFade } from '@/components/ui/blur-fade'
import { useNoticeCenter, type Notice } from '@/lib/notice-center'

const NOTICE_STACK_DELAY_MS = 120
const VIEWPORT_BASE_CLASS_NAME = 'pointer-events-none fixed left-1/2 top-[calc(env(safe-area-inset-top)+0.75rem)] z-50 -translate-x-1/2 sm:left-auto sm:right-3 sm:translate-x-0 md:right-4'
const DEFAULT_VIEWPORT_WIDTH_CLASS_NAME = 'w-[min(calc(100vw-2.5rem),20rem)] sm:w-[min(calc(100vw-1.5rem),24rem)]'
const COMPACT_VIEWPORT_WIDTH_CLASS_NAME = 'w-[min(calc(100vw-4.25rem),14rem)] sm:w-[min(calc(100vw-2rem),16rem)]'
const NOTICE_BUTTON_CLASS_NAME = 'pointer-events-auto block w-full border-transparent bg-transparent px-0 py-0 text-left outline-none shadow-none [&>[data-button-content]]:w-full'

type FloatingNoticeCardProps = {
    notice: Notice
    onNavigate: (href: string, id: string) => void
    onPress: (handler: () => void | Promise<void>, id: string) => Promise<void>
}

function getViewportClassName(hasOnlyCompactNotices: boolean): string {
    return [
        VIEWPORT_BASE_CLASS_NAME,
        hasOnlyCompactNotices ? COMPACT_VIEWPORT_WIDTH_CLASS_NAME : DEFAULT_VIEWPORT_WIDTH_CLASS_NAME
    ].join(' ')
}

const FloatingNoticeCard = memo(function FloatingNoticeCard(props: FloatingNoticeCardProps) {
    const [isPending, setIsPending] = useState(false)
    const isMountedRef = useRef(true)
    const icon = props.notice.icon ?? getNoticeToneIcon(props.notice.tone)
    const href = props.notice.href
    const onPress = props.notice.onPress
    const content = (
        <AppNotice
            tone={props.notice.tone}
            icon={icon}
            title={props.notice.title}
            description={props.notice.description}
            compact={props.notice.compact}
            className="w-full transition-transform duration-200 hover:-translate-y-0.5"
        />
    )

    useEffect(() => {
        return () => {
            isMountedRef.current = false
        }
    }, [])

    if (!href && onPress) {
        return (
            <Button
                type="button"
                variant="ghost"
                className={`${NOTICE_BUTTON_CLASS_NAME} disabled:cursor-progress disabled:opacity-80`}
                disabled={isPending}
                aria-busy={isPending}
                onClick={async () => {
                    if (isPending) {
                        return
                    }

                    setIsPending(true)
                    try {
                        await props.onPress(onPress, props.notice.id)
                    } finally {
                        if (isMountedRef.current) {
                            setIsPending(false)
                        }
                    }
                }}
            >
                {content}
            </Button>
        )
    }

    if (!href) {
        return <div className="pointer-events-auto">{content}</div>
    }

    return (
        <Button
            type="button"
            variant="ghost"
            className={NOTICE_BUTTON_CLASS_NAME}
            onClick={() => props.onNavigate(href, props.notice.id)}
        >
            {content}
        </Button>
    )
})

export function FloatingNoticeViewport() {
    const navigate = useNavigate()
    const { notices, dismissNotice } = useNoticeCenter()

    if (notices.length === 0) {
        return null
    }

    const hasOnlyCompactNotices = notices.every((notice) => notice.compact === true)

    return (
        <div
            className={getViewportClassName(hasOnlyCompactNotices)}
            aria-live="polite"
        >
            <BlurFade offset={14} blur="12px" duration={0.28} className="w-full">
                <AnimatedList className="w-full items-stretch gap-2.5" delay={NOTICE_STACK_DELAY_MS}>
                    {notices.map((notice) => (
                        <FloatingNoticeCard
                            key={notice.id}
                            notice={notice}
                            onNavigate={(href, id) => {
                                dismissNotice(id)
                                void navigate({ to: href })
                            }}
                            onPress={async (handler, id) => {
                                try {
                                    await handler()
                                    dismissNotice(id)
                                } catch (error) {
                                    console.error('Failed to handle floating notice action:', error)
                                }
                            }}
                        />
                    ))}
                </AnimatedList>
            </BlurFade>
        </div>
    )
}
